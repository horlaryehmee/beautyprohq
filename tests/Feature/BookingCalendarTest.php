<?php

namespace Tests\Feature;

use App\Models\Booking;
use App\Models\ProviderProfile;
use App\Models\Service;
use App\Models\User;
use App\Notifications\BookingStatusNotification;
use App\Support\BookingCalendar;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BookingCalendarTest extends TestCase
{
    use RefreshDatabase;

    public function test_booking_email_has_no_calendar_links_or_attachments_for_customer_and_provider(): void
    {
        $booking = $this->booking();
        $notification = new BookingStatusNotification($booking, 'Your booking is confirmed.');

        foreach ([$booking->customer, $booking->provider->user] as $recipient) {
            $mail = $notification->toMail($recipient);
            $rendered = $mail->render();

            $this->assertStringNotContainsString('Google Calendar', $rendered);
            $this->assertStringNotContainsString('calendar.ics', $rendered);
            $this->assertCount(0, $mail->rawAttachments);
        }
    }

    public function test_booking_email_can_use_the_immediate_php_mail_transport(): void
    {
        config(['mail.booking_mailer' => 'php_mail']);
        $booking = $this->booking();

        $mail = (new BookingStatusNotification($booking, 'Your booking is confirmed.'))
            ->toMail($booking->customer);

        $this->assertSame('php_mail', $mail->mailer);
    }

    public function test_signed_calendar_download_contains_the_booking_without_private_contact_details(): void
    {
        $booking = $this->booking();
        $url = app(BookingCalendar::class)->links($booking)['download'];

        $response = $this->get($url)->assertOk();

        $response->assertHeader('Content-Type', 'text/calendar; charset=UTF-8');
        $response->assertHeader('Content-Disposition', 'attachment; filename="beautypro-booking-'.$booking->id.'.ics"');
        $response->assertSee('UID:booking-'.$booking->id.'@beautyprohq.com', false);
        $response->assertSee('DTSTART:', false);
        $response->assertSee('DTEND:', false);
        $response->assertSee('Soft Glam Makeup with Ada Provider', false);
        $response->assertDontSee('08012345678', false);
        $response->assertDontSee('Private booking note', false);
    }

    public function test_booking_email_is_still_built_when_calendar_data_is_invalid(): void
    {
        $booking = $this->booking();
        $booking->setAttribute('time', 'invalid');
        $notification = new BookingStatusNotification($booking, 'Your booking is confirmed.');

        $mail = $notification->toMail($booking->customer);
        $rendered = $mail->render();

        $this->assertStringContainsString('Your booking is confirmed.', $rendered);
        $this->assertStringContainsString('Soft Glam Makeup', $rendered);
        $this->assertStringNotContainsString('Google Calendar', $rendered);
        $this->assertCount(0, $mail->rawAttachments);
    }

    public function test_calendar_download_rejects_an_unsigned_link(): void
    {
        $booking = $this->booking();

        $this->get(route('bookings.calendar', ['booking' => $booking->id], false))
            ->assertForbidden();
    }

    private function booking(): Booking
    {
        $providerUser = User::factory()->create(['role' => 'provider', 'name' => 'Ada Provider']);
        $customer = User::factory()->create([
            'role' => 'customer',
            'name' => 'Tola Customer',
            'phone' => '08012345678',
        ]);
        $provider = ProviderProfile::create([
            'user_id' => $providerUser->id,
            'slug' => 'ada-provider-calendar',
            'profession' => 'Makeup Artist',
            'timezone' => 'Africa/Lagos',
        ]);
        $service = Service::create([
            'provider_id' => $provider->id,
            'name' => 'Soft Glam Makeup',
            'price' => 35000,
            'currency' => 'NGN',
            'duration_minutes' => 90,
            'is_active' => true,
        ]);

        return Booking::create([
            'provider_id' => $provider->id,
            'customer_id' => $customer->id,
            'service_id' => $service->id,
            'date' => now()->addDays(2)->toDateString(),
            'time' => '10:00:00',
            'end_time' => '11:30:00',
            'status' => 'confirmed',
            'notes' => 'Private booking note',
        ])->load(['provider.user', 'customer', 'service', 'payment']);
    }
}
