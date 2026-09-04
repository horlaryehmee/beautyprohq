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
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GoogleCalendarIntegrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_calendar_authorization_requests_offline_event_access(): void
    {
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google.enabled', '1');

        $url = app(GoogleCalendarService::class)->authorizationUrl('state-value', 'challenge-value', 'pro@example.com');
        parse_str(parse_url($url, PHP_URL_QUERY), $query);

        $this->assertSame('offline', $query['access_type']);
        $this->assertSame('form_post', $query['response_mode']);
        $this->assertStringContainsString('calendar.events', $query['scope']);
        $this->assertStringEndsWith('/auth/google/calendar/callback', $query['redirect_uri']);
    }

    public function test_booking_is_created_updated_and_removed_from_the_connected_calendar(): void
    {
        [$booking, $connection] = $this->calendarBooking();
        Http::fake([
            'https://www.googleapis.com/calendar/v3/calendars/primary/events' => Http::response(['id' => 'google-event-123'], 200),
            'https://www.googleapis.com/calendar/v3/calendars/primary/events/google-event-123' => Http::response(['id' => 'google-event-123'], 200),
        ]);

        $calendar = app(GoogleCalendarService::class);
        $this->assertTrue($calendar->syncBookingSafely($booking));
        $this->assertDatabaseHas('bookings', [
            'id' => $booking->id,
            'google_calendar_event_id' => 'google-event-123',
            'google_calendar_sync_error' => null,
        ]);
        Http::assertSent(function (Request $request): bool {
            return $request->method() === 'POST'
                && $request->url() === 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
                && $request['start']['timeZone'] === 'Africa/Lagos'
                && $request['reminders']['overrides'][0] === ['method' => 'email', 'minutes' => 1440]
                && $request['reminders']['overrides'][1] === ['method' => 'popup', 'minutes' => 30];
        });

        $booking->refresh()->update(['status' => 'confirmed']);
        $this->assertTrue($calendar->syncBookingSafely($booking));
        Http::assertSent(fn (Request $request): bool => $request->method() === 'PATCH'
            && $request->url() === 'https://www.googleapis.com/calendar/v3/calendars/primary/events/google-event-123'
            && $request['description'] && str_contains($request['description'], 'Status: Confirmed'));

        $booking->refresh()->update(['status' => 'cancelled']);
        $this->assertTrue($calendar->syncBookingSafely($booking));
        $this->assertNull($booking->fresh()->google_calendar_event_id);
        Http::assertSent(fn (Request $request): bool => $request->method() === 'DELETE'
            && $request->url() === 'https://www.googleapis.com/calendar/v3/calendars/primary/events/google-event-123');

        $rawConnection = DB::table('provider_calendar_connections')->find($connection->id);
        $this->assertNotSame('access-token', $rawConnection->access_token);
        $this->assertNotSame('refresh-token', $rawConnection->refresh_token);
    }

    public function test_provider_can_complete_calendar_connection_when_google_posts_the_callback(): void
    {
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google.enabled', '1');
        $providerUser = User::factory()->create(['role' => 'provider', 'email' => 'provider@example.com']);
        $provider = ProviderProfile::create([
            'user_id' => $providerUser->id,
            'slug' => 'oauth-calendar-pro',
            'profession' => 'Nail Artist',
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
        ]);

        $this->post('/auth/google/calendar/callback', ['state' => $query['state'], 'code' => 'google-code'])
            ->assertRedirect('/provider/calendar?calendar_connected=1&calendar_synced=0');

        $connection = ProviderCalendarConnection::where('provider_id', $provider->id)->firstOrFail();
        $this->assertSame('calendar-owner@example.com', $connection->google_email);
        $this->assertSame('fresh-refresh-token', $connection->refresh_token);
        $this->assertNotSame('fresh-refresh-token', DB::table('provider_calendar_connections')->where('id', $connection->id)->value('refresh_token'));
    }

    public function test_admin_calendar_switch_stops_automatic_syncing(): void
    {
        [$booking] = $this->calendarBooking();
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google.enabled', '1');
        AppSetting::setValue('google.calendar_enabled', '0');
        Http::fake();

        $this->assertFalse(app(GoogleCalendarService::class)->syncBookingSafely($booking));
        Http::assertNothingSent();
        $this->assertNull($booking->fresh()->google_calendar_event_id);
    }

    private function calendarBooking(): array
    {
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google.enabled', '1');
        AppSetting::setValue('google.calendar_enabled', '1');

        $providerUser = User::factory()->create(['role' => 'provider']);
        $customer = User::factory()->create(['role' => 'customer', 'name' => 'Ada Customer', 'phone' => '08012345678']);
        $provider = ProviderProfile::create([
            'user_id' => $providerUser->id,
            'slug' => 'calendar-pro',
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
            'time' => '10:00:00',
            'end_time' => '11:30:00',
            'status' => 'pending',
        ]);
        $connection = ProviderCalendarConnection::create([
            'provider_id' => $provider->id,
            'google_email' => 'pro@example.com',
            'calendar_id' => 'primary',
            'access_token' => 'access-token',
            'refresh_token' => 'refresh-token',
            'access_token_expires_at' => now()->addHour(),
            'connected_at' => now(),
        ]);

        return [$booking, $connection];
    }
}
