<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\ProviderCalendarConnection;
use App\Models\ProviderProfile;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class GoogleCalendarService
{
    private const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

    private const CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3';

    public function __construct(private readonly GoogleOAuthService $oauth) {}

    public function enabled(): bool
    {
        return $this->oauth->enabled();
    }

    public function redirectUri(): string
    {
        return $this->oauth->calendarRedirectUri();
    }

    public function authorizationUrl(string $state, string $codeChallenge, ?string $loginHint = null): string
    {
        return self::AUTHORIZE_URL.'?'.http_build_query(array_filter([
            'client_id' => $this->oauth->clientId(),
            'redirect_uri' => $this->redirectUri(),
            'response_type' => 'code',
            'response_mode' => 'form_post',
            'scope' => 'openid email https://www.googleapis.com/auth/calendar.events',
            'state' => $state,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256',
            'access_type' => 'offline',
            'include_granted_scopes' => 'true',
            'prompt' => 'consent select_account',
            'login_hint' => $loginHint,
        ], fn (mixed $value): bool => filled($value)), '', '&', PHP_QUERY_RFC3986);
    }

    public function exchangeCode(string $code, string $codeVerifier): array
    {
        $token = Http::asForm()->connectTimeout(5)->timeout(15)->post(self::TOKEN_URL, [
            'code' => $code,
            'client_id' => $this->oauth->clientId(),
            'client_secret' => $this->oauth->clientSecret(),
            'redirect_uri' => $this->redirectUri(),
            'grant_type' => 'authorization_code',
            'code_verifier' => $codeVerifier,
        ])->throw()->json();

        if (blank($token['access_token'] ?? null) || blank($token['refresh_token'] ?? null)) {
            throw ValidationException::withMessages([
                'google' => 'Google did not grant offline calendar access. Please connect again and approve calendar access.',
            ]);
        }

        $profile = Http::withToken($token['access_token'])->acceptJson()->connectTimeout(5)->timeout(15)
            ->get(self::USERINFO_URL)->throw()->json();

        return [
            'access_token' => $token['access_token'],
            'refresh_token' => $token['refresh_token'],
            'access_token_expires_at' => now()->addSeconds(max(60, (int) ($token['expires_in'] ?? 3600))),
            'google_email' => $profile['email'] ?? null,
        ];
    }

    public function syncBookingSafely(Booking $booking): bool
    {
        try {
            return $this->syncBooking($booking->fresh() ?? $booking);
        } catch (\Throwable $exception) {
            Log::warning('Google Calendar booking sync failed without blocking booking flow.', [
                'booking_id' => $booking->id,
                'provider_id' => $booking->provider_id,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);

            $message = mb_substr($exception->getMessage(), 0, 2000);
            $booking->newQuery()->whereKey($booking->id)->update(['google_calendar_sync_error' => $message]);
            ProviderCalendarConnection::where('provider_id', $booking->provider_id)->update(['last_error' => $message]);

            return false;
        }
    }

    public function syncUpcoming(ProviderProfile $provider, int $limit = 50): array
    {
        $bookings = $provider->bookings()->upcoming()->with(['provider.user', 'customer', 'service'])->orderBy('date')->orderBy('time')->limit($limit)->get();
        $synced = 0;
        $failed = 0;

        foreach ($bookings as $booking) {
            $this->syncBookingSafely($booking) ? $synced++ : $failed++;
        }

        return ['synced' => $synced, 'failed' => $failed, 'total' => $bookings->count()];
    }

    private function syncBooking(Booking $booking): bool
    {
        $booking->loadMissing(['provider.user', 'customer', 'service']);
        $connection = $booking->provider?->calendarConnection;
        if (! $connection) {
            return false;
        }

        $accessToken = $this->accessToken($connection);
        if (in_array($booking->status, ['cancelled', 'rejected'], true)) {
            if ($booking->google_calendar_event_id) {
                $response = $this->calendarRequest($accessToken)->delete($this->eventUrl($connection, $booking->google_calendar_event_id));
                if (! $response->successful() && ! in_array($response->status(), [404, 410], true)) {
                    $response->throw();
                }
            }

            $booking->forceFill([
                'google_calendar_event_id' => null,
                'google_calendar_synced_at' => now(),
                'google_calendar_sync_error' => null,
            ])->saveQuietly();
            $this->markConnectionSynced($connection);

            return true;
        }

        $response = $booking->google_calendar_event_id
            ? $this->calendarRequest($accessToken)->patch($this->eventUrl($connection, $booking->google_calendar_event_id), $this->eventPayload($booking))
            : $this->calendarRequest($accessToken)->post($this->eventsUrl($connection), $this->eventPayload($booking));

        if ($booking->google_calendar_event_id && in_array($response->status(), [404, 410], true)) {
            $response = $this->calendarRequest($accessToken)->post($this->eventsUrl($connection), $this->eventPayload($booking));
        }
        $response->throw();

        $booking->forceFill([
            'google_calendar_event_id' => $response->json('id') ?: $booking->google_calendar_event_id,
            'google_calendar_synced_at' => now(),
            'google_calendar_sync_error' => null,
        ])->saveQuietly();
        $this->markConnectionSynced($connection);

        return true;
    }

    private function accessToken(ProviderCalendarConnection $connection): string
    {
        if (filled($connection->access_token) && $connection->access_token_expires_at?->isAfter(now()->addMinutes(2))) {
            return $connection->access_token;
        }

        $token = Http::asForm()->connectTimeout(5)->timeout(15)->post(self::TOKEN_URL, [
            'client_id' => $this->oauth->clientId(),
            'client_secret' => $this->oauth->clientSecret(),
            'refresh_token' => $connection->refresh_token,
            'grant_type' => 'refresh_token',
        ])->throw()->json();

        if (blank($token['access_token'] ?? null)) {
            throw new \RuntimeException('Google Calendar access could not be refreshed. Please reconnect your calendar.');
        }

        $connection->forceFill([
            'access_token' => $token['access_token'],
            'access_token_expires_at' => now()->addSeconds(max(60, (int) ($token['expires_in'] ?? 3600))),
        ])->save();

        return $token['access_token'];
    }

    private function eventPayload(Booking $booking): array
    {
        $timezone = $booking->provider?->timezone ?: config('app.timezone', 'Africa/Lagos');
        $date = $booking->date->format('Y-m-d');
        $start = CarbonImmutable::createFromFormat('Y-m-d H:i:s', $date.' '.substr((string) $booking->time, 0, 8), $timezone);
        $end = filled($booking->end_time)
            ? CarbonImmutable::createFromFormat('Y-m-d H:i:s', $date.' '.substr((string) $booking->end_time, 0, 8), $timezone)
            : $start->addMinutes((int) ($booking->service?->duration_minutes ?: 60));

        return [
            'summary' => ($booking->service?->name ?: 'Beauty appointment').' — '.($booking->customer?->name ?: 'Customer'),
            'description' => implode("\n", array_filter([
                'BeautyPro HQ booking #'.$booking->id,
                'Status: '.ucfirst((string) $booking->status),
                'Customer: '.($booking->customer?->name ?: 'Not provided'),
                'Email: '.($booking->customer?->email ?: 'Not provided'),
                'Phone: '.($booking->customer?->phone ?: 'Not provided'),
                $booking->notes ? 'Notes: '.$booking->notes : null,
            ])),
            'start' => ['dateTime' => $start->toRfc3339String(), 'timeZone' => $timezone],
            'end' => ['dateTime' => $end->toRfc3339String(), 'timeZone' => $timezone],
            'reminders' => [
                'useDefault' => false,
                'overrides' => [
                    ['method' => 'email', 'minutes' => 1440],
                    ['method' => 'popup', 'minutes' => 30],
                ],
            ],
            'extendedProperties' => ['private' => ['beautypro_booking_id' => (string) $booking->id]],
        ];
    }

    private function calendarRequest(string $accessToken): PendingRequest
    {
        return Http::withToken($accessToken)->acceptJson()->connectTimeout(5)->timeout(15);
    }

    private function eventsUrl(ProviderCalendarConnection $connection): string
    {
        return self::CALENDAR_API_URL.'/calendars/'.rawurlencode($connection->calendar_id).'/events';
    }

    private function eventUrl(ProviderCalendarConnection $connection, string $eventId): string
    {
        return $this->eventsUrl($connection).'/'.rawurlencode($eventId);
    }

    private function markConnectionSynced(ProviderCalendarConnection $connection): void
    {
        $connection->forceFill(['last_synced_at' => now(), 'last_error' => null])->save();
    }
}
