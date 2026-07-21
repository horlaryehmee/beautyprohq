<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CrmCustomer;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Notifications\BookingStatusNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::where('provider_id', $request->user()->providerProfile->id)
            ->with(['customer:id,name,email,phone', 'service', 'payment', 'review'])
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->date, fn ($q, $date) => $q->whereDate('date', $date))
            ->orderByDesc('date')->orderByDesc('time')->paginate($request->integer('per_page', 20));

        return $this->success($bookings->items(), meta: $this->paginationMeta($bookings));
    }

    public function updateStatus(Request $request, Booking $booking): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($booking->provider_id === $provider->id, 403);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['confirmed', 'completed', 'cancelled', 'rejected'])],
            'rejection_reason' => ['nullable', 'required_if:status,rejected', 'string', 'max:1000'],
        ]);

        $allowed = [
            'pending' => ['confirmed', 'cancelled', 'rejected'],
            'confirmed' => ['completed', 'cancelled'],
            'completed' => [],
            'cancelled' => [],
            'rejected' => [],
        ];
        abort_unless(in_array($validated['status'], $allowed[$booking->status] ?? [], true), 422, 'That booking status transition is not allowed.');

        DB::transaction(function () use ($booking, $validated, $provider): void {
            $booking->update([
                ...$validated,
                'cancelled_at' => $validated['status'] === 'cancelled' ? now() : null,
            ]);

            if ($validated['status'] === 'completed') {
                CrmCustomer::updateOrCreate(
                    ['provider_id' => $provider->id, 'customer_id' => $booking->customer_id],
                    ['last_service_at' => now()]
                );
                $points = (int) ($provider->loyalty_points_per_booking ?? 0);
                if ($provider->loyalty_enabled && $points > 0) {
                    $loyalty = Loyalty::firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $booking->customer_id]);
                    $loyalty->increment('points', $points);
                    $loyalty->increment('lifetime_points', $points);
                    LoyaltyTransaction::create(['loyalty_id' => $loyalty->id, 'booking_id' => $booking->id, 'points' => $points, 'reason' => 'Completed booking']);
                }
            }
        });

        $booking->load(['provider.user', 'customer', 'service', 'payment']);
        $booking->customer->notify(new BookingStatusNotification($booking, "Your booking was {$booking->status} by {$booking->provider->user->name}."));

        return $this->success($booking, 'Booking status updated.');
    }
}
