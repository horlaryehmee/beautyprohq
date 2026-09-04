<?php

namespace App\Http\Controllers;

use App\Models\ProviderCalendarConnection;
use App\Models\User;
use App\Services\GoogleCalendarService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GoogleCalendarOAuthController extends Controller
{
    public function redirect(Request $request, GoogleCalendarService $calendar): RedirectResponse
    {
        $user = $request->user();
        if (! $user?->isProvider() || ! $user->providerProfile) {
            return $this->errorRedirect('Only provider accounts can connect a booking calendar.');
        }
        if (! $calendar->enabled()) {
            return $this->errorRedirect('Google Calendar is not available yet. Ask the platform administrator to finish the Google setup.');
        }

        $state = Str::random(64);
        $codeVerifier = Str::random(96);
        $pending = [
            'state' => $state,
            'code_verifier' => $codeVerifier,
            'user_id' => $user->id,
            'provider_id' => $user->providerProfile->id,
            'started_at' => now()->timestamp,
        ];
        $request->session()->put('google_calendar_oauth', $pending);
        Cache::put($this->cacheKey($state), $pending, now()->addMinutes(10));

        $challenge = rtrim(strtr(base64_encode(hash('sha256', $codeVerifier, true)), '+/', '-_'), '=');

        return redirect()->away($calendar->authorizationUrl($state, $challenge, $user->email));
    }

    public function callback(Request $request, GoogleCalendarService $calendar): RedirectResponse
    {
        $state = (string) $request->input('state');
        $sessionPending = $request->session()->pull('google_calendar_oauth');
        $cachedPending = filled($state) ? Cache::pull($this->cacheKey($state)) : null;
        $pending = is_array($cachedPending) ? $cachedPending : $sessionPending;

        if (! is_array($pending)
            || now()->timestamp - (int) ($pending['started_at'] ?? 0) > 600
            || blank($state)
            || ! hash_equals((string) ($pending['state'] ?? ''), $state)) {
            return $this->errorRedirect('The Google Calendar connection expired or could not be verified. Please try again.');
        }
        if ($request->filled('error')) {
            return $this->errorRedirect('Google Calendar access was cancelled.');
        }
        if (blank($request->input('code'))) {
            return $this->errorRedirect('Google did not return an authorization code.');
        }

        try {
            $user = User::with('providerProfile')->find($pending['user_id']);
            if (! $user?->isProvider() || ! $user->is_active || (int) $user->providerProfile?->id !== (int) $pending['provider_id']) {
                return $this->errorRedirect('This provider account is no longer available.');
            }

            $tokens = $calendar->exchangeCode((string) $request->input('code'), (string) $pending['code_verifier']);
            ProviderCalendarConnection::updateOrCreate(
                ['provider_id' => $user->providerProfile->id],
                [
                    ...$tokens,
                    'calendar_id' => 'primary',
                    'connected_at' => now(),
                    'last_error' => null,
                ],
            );

            $result = $calendar->syncUpcoming($user->providerProfile, 50);

            return redirect('/provider/calendar?'.http_build_query([
                'calendar_connected' => '1',
                'calendar_synced' => $result['synced'],
            ]));
        } catch (\Throwable $exception) {
            report($exception);

            return $this->errorRedirect($exception instanceof ValidationException
                ? collect($exception->errors())->flatten()->first()
                : 'Google Calendar could not be connected. Please try again.');
        }
    }

    private function cacheKey(string $state): string
    {
        return 'google_calendar_oauth:'.hash('sha256', $state);
    }

    private function errorRedirect(string $message): RedirectResponse
    {
        return redirect('/provider/calendar?'.http_build_query(['calendar_error' => $message]));
    }
}
