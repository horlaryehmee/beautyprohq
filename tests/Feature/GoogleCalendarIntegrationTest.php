<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\ProviderCalendarConnection;
use App\Models\ProviderProfile;
use App\Models\Service;
use App\Models\User;
use App\Services\GoogleCalendarService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleCalendarIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_authorization_uses_only_the_app_created_calendar_scope(): void
    {
        $this->enableGoogle();

        $url = app(GoogleCalendarService::class)->authorizationUrl('state-value', 'challenge-value', 'pro@example.com');
        parse_str(parse_url($url, PHP_URL_QUERY), $query);

        $this->assertSame('offline', $query['access_type']);
        $this->assertStringContainsString('calendar.app.created', $query['scope']);
        $this->assertStringNotContainsString('/auth/calendar.events', $query['scope']);
        $this->assertStringNotContainsString('/auth/calendar ', $query['scope']);
        $this->assertArrayNotHasKey('include_granted_scopes', $query);
        $this->assertStringEndsWith('/auth/google/calendar/callback', $query['redirect_uri']);
    }

    public function test_connecting_creates_a_dedicated_secondary_calendar(): void
    {
        $this->enableGoogle();
        $providerUser = User::factory()->create(['role' => 'provider', 'email' => 'provider@example.com']);
        $provider = ProviderProfile::create([
            'user_id' => $providerUser->id,
            'slug' => 'app-calendar-pro',
            'profession' => 'Nail Artist',
            'timezone' => 'Africa/Lagos',
        ]);

        $redirect = $this->actingAs($providerUser)->get('/auth/google/calendar/redirect')->assertRedirect();
        parse_str(parse_url($redirect->headers->get('Location'), PHP_URL_QUERY), $query);

        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'fresh-access-token',
                'refresh_token' => 'fresh-refresh-token',
                'expires_in' => 3600,
            ]),
            'https://openidconnect.googleapis.com/v1/userinfo' => Http::response(['email' => 'calendar-owner@example.com']),
            'https://www.googleapis.com/calendar/v3/calendars' => Http::response(['id' => 'beautypro-secondary-calendar'], 200),
        ]);

        $this->post('/auth/google/calendar/callback', ['state' => $query['state'], 'code' => 'google-code'])
            ->assertRedirect('/provider/calendar?calendar_connected=1&calendar_synced=0');

        $connection = ProviderCalendarConnection::where('provider_id', $provider->id)->firstOrFail();
        $this->assertSame('beautypro-secondary-calendar', $connection->calendar_id);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://www.googleapis.com/calendar/v3/calendars'
            && $request['summary'] === 'BeautyPro HQ Bookings');
    }

    public function test_booking_sync_writes_only_to_the_app_created_calendar(): void
    {
        $this->enableGoogle();
        $providerUser = User::factory()->create(['role' => 'provider']);
        $customer = User::factory()->create(['role' => 'customer', 'name' => 'Ada Customer']);
        $provider = ProviderProfile::create([
            'user_id' => $providerUser->id,
            'slug' => 'calendar-sync-pro',
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
        $booking = Booking::create([
            'provider_id' => $provider->id,
            'customer_id' => $customer->id,
            'service_id' => $service->id,
            'date' => now()->addDays(2)->toDateString(),
            'time' => '10:00',
            'end_time' => '11:30',
            'status' => 'pending',
        ]);
        ProviderCalendarConnection::create([
            'provider_id' => $provider->id,
            'google_email' => 'pro@example.com',
            'calendar_id' => 'beautypro-secondary-calendar',
            'access_token' => 'access-token',
            'refresh_token' => 'refresh-token',
            'access_token_expires_at' => now()->addHour(),
            'connected_at' => now(),
        ]);
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/beautypro-secondary-calendar/events' => Http::response(['id' => 'booking-event'], 200),
        ]);

        $this->assertTrue(app(GoogleCalendarService::class)->syncBookingSafely($booking));
        $this->assertSame('booking-event', $booking->fresh()->google_calendar_event_id);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'POST'
            && $request->url() === 'https://www.googleapis.com/calendar/v3/calendars/beautypro-secondary-calendar/events');
        Http::assertNotSent(fn (Request $request): bool => str_contains($request->url(), '/calendars/primary/'));
    }

    private function enableGoogle(): void
    {
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google.enabled', '1');
    }
}
