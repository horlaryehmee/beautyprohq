<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePaidProvider;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\Payment;
use App\Models\ProviderProfile;
use App\Models\User;
use App\Services\BookingWhatsAppNotificationService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BookingWhatsAppLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        AppSetting::setValue('twilio.account_sid', 'AC123456789');
        AppSetting::setValue('twilio.auth_token', 'test-auth-token', true);
        AppSetting::setValue('twilio.whatsapp_from', 'whatsapp:+14155238886');
        AppSetting::setValue('twilio.provider_booking_content_sid', 'HX11111111111111111111111111111111');
        AppSetting::setValue('twilio.client_confirmation_content_sid', 'HX22222222222222222222222222222222');
        AppSetting::setValue('twilio.client_reminder_content_sid', 'HX33333333333333333333333333333333');
        AppSetting::setValue('twilio.reminder_hours_before', '24');
        AppSetting::setValue('features.provider_whatsapp_notifications', '1');
    }

    public function test_provider_new_booking_template_is_sent_once(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM_TEST'], 201)]);
        [$booking] = $this->booking('pending', 'manual', 'pending');
        $service = app(BookingWhatsAppNotificationService::class);

        $this->assertTrue($service->send($booking, BookingWhatsAppNotificationService::PROVIDER_BOOKING));
        $this->assertFalse($service->send($booking->fresh(), BookingWhatsAppNotificationService::PROVIDER_BOOKING));

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['To'] === 'whatsapp:+2348099999999'
            && $request['ContentSid'] === 'HX11111111111111111111111111111111'
            && json_decode($request['ContentVariables'], true)['2'] === 'Test Client');
        $this->assertNotNull($booking->fresh()->provider_whatsapp_notified_at);
    }

    public function test_admin_switch_pauses_every_automated_booking_message_but_not_manual_tests(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM_TEST'], 201)]);
        AppSetting::setValue('features.provider_whatsapp_notifications', '0');
        [$booking] = $this->booking('confirmed', 'paystack', 'paid');
        $service = app(BookingWhatsAppNotificationService::class);

        $this->assertFalse($service->send($booking, BookingWhatsAppNotificationService::PROVIDER_BOOKING));
        $this->assertFalse($service->send($booking, BookingWhatsAppNotificationService::CLIENT_CONFIRMATION));
        $this->assertFalse($service->send($booking, BookingWhatsAppNotificationService::CLIENT_REMINDER));
        Http::assertSentCount(0);

        $this->assertTrue($service->sendTest('+2348012345678', BookingWhatsAppNotificationService::CLIENT_CONFIRMATION));
        Http::assertSentCount(1);
        $this->assertNull($booking->fresh()->provider_whatsapp_notified_at);
        $this->assertNull($booking->fresh()->customer_whatsapp_confirmed_at);
        $this->assertNull($booking->fresh()->customer_whatsapp_reminded_at);
    }

    public function test_reminder_command_does_not_queue_messages_while_admin_switch_is_off(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM_TEST'], 201)]);
        AppSetting::setValue('features.provider_whatsapp_notifications', '0');
        [$booking] = $this->booking('confirmed', 'paystack', 'paid', now()->addHours(12)->toDateString());

        Artisan::call('whatsapp:send-booking-reminders');

        $this->assertStringContainsString('paused', Artisan::output());
        Http::assertSentCount(0);
        $this->assertNull($booking->fresh()->customer_whatsapp_reminded_at);
    }

    public function test_failed_provider_delivery_is_not_retried_when_twilio_may_have_accepted_it(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['message' => 'Upstream acknowledgement failed'], 500)]);
        [$booking] = $this->booking('pending', 'manual', 'pending');
        $service = app(BookingWhatsAppNotificationService::class);

        $this->assertFalse($service->send($booking, BookingWhatsAppNotificationService::PROVIDER_BOOKING));
        $this->assertFalse($service->send($booking->fresh(), BookingWhatsAppNotificationService::PROVIDER_BOOKING));

        Http::assertSentCount(1);
        $this->assertNotNull($booking->fresh()->provider_whatsapp_notified_at);
    }

    public function test_manual_booking_confirmation_is_sent_only_when_provider_accepts(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM_TEST'], 201)]);
        $this->withoutMiddleware(EnsurePaidProvider::class);
        [$booking, $providerUser] = $this->booking('pending', 'manual', 'pending');
        $this->assertNull($booking->customer_whatsapp_confirmed_at);

        Sanctum::actingAs($providerUser);
        $this->patchJson("/api/provider/bookings/{$booking->id}/status", ['status' => 'confirmed'])->assertOk();

        $booking->refresh();
        $this->assertSame('confirmed', $booking->status);
        $this->assertSame('paid', $booking->payment->status);
        $this->assertNotNull($booking->customer_whatsapp_confirmed_at);
        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['To'] === 'whatsapp:+2348012345678'
            && $request['ContentSid'] === 'HX22222222222222222222222222222222');
    }

    public function test_reminder_waits_for_the_lead_time_and_is_then_sent_once(): void
    {
        Http::fake(['api.twilio.com/*' => Http::response(['sid' => 'SM_TEST'], 201)]);
        Carbon::setTestNow(Carbon::parse('2026-09-09 10:00:00', 'Africa/Lagos'));
        [$booking] = $this->booking('confirmed', 'paystack', 'paid', '2026-09-10', '12:00:00');

        Artisan::call('whatsapp:send-booking-reminders');
        Http::assertSentCount(0);
        $this->assertNull($booking->fresh()->customer_whatsapp_reminded_at);

        Carbon::setTestNow(Carbon::parse('2026-09-09 13:00:00', 'Africa/Lagos'));
        Artisan::call('whatsapp:send-booking-reminders');
        Artisan::call('whatsapp:send-booking-reminders');

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['To'] === 'whatsapp:+2348012345678'
            && $request['ContentSid'] === 'HX33333333333333333333333333333333'
            && json_decode($request['ContentVariables'], true)['5'] === 'Bridal makeup');
        $this->assertNotNull($booking->fresh()->customer_whatsapp_reminded_at);
        Carbon::setTestNow();
    }

    private function booking(string $bookingStatus, string $gateway, string $paymentStatus, ?string $date = null, string $time = '10:00:00'): array
    {
        $providerUser = User::factory()->provider()->create(['name' => 'Ada Beauty Studio']);
        $provider = ProviderProfile::create([
            'user_id' => $providerUser->id,
            'slug' => 'ada-beauty-studio-'.$providerUser->id,
            'profession' => 'Makeup Artist',
            'location' => 'Lagos',
            'timezone' => 'Africa/Lagos',
            'whatsapp_number' => '+2348099999999',
            'whatsapp_notifications_enabled' => true,
            'account_approved_at' => now(),
        ]);
        $customer = User::factory()->create(['name' => 'Test Client', 'phone' => '+2348012345678']);
        $service = $provider->services()->create([
            'name' => 'Bridal makeup',
            'price' => 25000,
            'currency' => 'NGN',
            'duration_minutes' => 60,
            'is_active' => true,
        ]);
        $booking = Booking::create([
            'provider_id' => $provider->id,
            'customer_id' => $customer->id,
            'service_id' => $service->id,
            'date' => $date ?: now()->addDays(2)->toDateString(),
            'time' => $time,
            'end_time' => '11:00:00',
            'status' => $bookingStatus,
        ]);
        Payment::create([
            'booking_id' => $booking->id,
            'provider_id' => $provider->id,
            'amount' => 25000,
            'currency' => 'NGN',
            'status' => $paymentStatus,
            'gateway' => $gateway,
            'reference' => 'TEST-'.$booking->id,
            'paid_at' => $paymentStatus === 'paid' ? now() : null,
            'metadata' => [],
        ]);

        return [$booking->load(['provider.user', 'customer', 'service', 'payment']), $providerUser];
    }
}
