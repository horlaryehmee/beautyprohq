<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Loyalty;
use App\Models\ProviderProfile;
use App\Models\SavedProvider;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $user = $request->user();
        $base = Booking::where('customer_id', $user->id);

        return $this->success([
            'stats' => [
                'upcoming_bookings' => (clone $base)->upcoming()->count(),
                'completed_bookings' => (clone $base)->where('status', 'completed')->count(),
                'loyalty_points' => Loyalty::where('customer_id', $user->id)->sum('points'),
                'saved_providers' => $user->savedProviders()->count(),
            ],
            'upcoming_bookings' => (clone $base)->upcoming()->with(['provider.user:id,name', 'service'])->orderBy('date')->orderBy('time')->limit(6)->get(),
            'rewards' => Loyalty::where('customer_id', $user->id)->where('points', '>', 0)->with('provider.user:id,name')->orderByDesc('points')->limit(6)->get(),
            'notifications' => $user->unreadNotifications()->latest()->limit(8)->get(),
        ]);
    }

    public function rewards(Request $request): JsonResponse
    {
        $loyalties = Loyalty::where('customer_id', $request->user()->id)
            ->with(['provider.user:id,name', 'provider.rewards' => fn ($q) => $q->where('is_active', true)->orderBy('points_required'), 'transactions' => fn ($q) => $q->latest()->limit(10)])
            ->orderByDesc('points')->get();

        return $this->success($loyalties);
    }

    public function saved(Request $request): JsonResponse
    {
        return $this->success($request->user()->savedProviders()->with(['user:id,name', 'services' => fn ($q) => $q->where('is_active', true)->limit(3)])->orderByDesc('saved_providers.created_at')->get());
    }

    public function save(Request $request, ProviderProfile $provider): JsonResponse
    {
        abort_unless($provider->is_listed, 404);
        SavedProvider::firstOrCreate(['customer_id' => $request->user()->id, 'provider_id' => $provider->id]);

        return $this->success($provider->load('user:id,name'), 'Provider saved.', 201);
    }

    public function unsave(Request $request, ProviderProfile $provider): JsonResponse
    {
        SavedProvider::where('customer_id', $request->user()->id)->where('provider_id', $provider->id)->delete();

        return $this->success(null, 'Provider removed from saved providers.');
    }
}
