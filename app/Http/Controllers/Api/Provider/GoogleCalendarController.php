<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Services\GoogleCalendarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GoogleCalendarController extends Controller
{
    public function show(Request $request, GoogleCalendarService $calendar): JsonResponse
    {
        $connection = $request->user()->providerProfile->calendarConnection;

        return $this->success([
            'available' => $calendar->enabled(),
            'connected' => (bool) $connection,
            'google_email' => $connection?->google_email,
            'connected_at' => $connection?->connected_at?->toIso8601String(),
            'last_synced_at' => $connection?->last_synced_at?->toIso8601String(),
            'last_error' => $connection?->last_error,
            'connect_url' => route('auth.google.calendar.redirect'),
        ]);
    }

    public function sync(Request $request, GoogleCalendarService $calendar): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($provider->calendarConnection, 422, 'Connect Google Calendar first.');

        $result = $calendar->syncUpcoming($provider, 100);

        return $this->success($result, $result['failed']
            ? "Synced {$result['synced']} bookings; {$result['failed']} could not be synced."
            : "{$result['synced']} upcoming bookings synced.");
    }

    public function destroy(Request $request): JsonResponse
    {
        $request->user()->providerProfile->calendarConnection?->delete();

        return $this->success(null, 'Google Calendar disconnected. Events already added to Google Calendar will remain there.');
    }
}
