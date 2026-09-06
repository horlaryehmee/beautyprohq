<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CrmCustomer;
use App\Models\LiveChatConversation;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Notifications\BookingStatusNotification;
use App\Notifications\PlatformUpdateNotification;
use App\Services\GoogleCalendarService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::where('provider_id', $request->user()->providerProfile->id)
            ->with(['customer:id,name,email,phone', 'service', 'payment', 'review'])
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->when($request->date, fn ($q, $date) => $q->whereDate('date', $date))
            ->orderByDesc('date')->orderByDesc('time')->paginate($this->perPage($request, 20, 50));

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
        $booking->loadMissing(['payment', 'customer', 'service', 'provider.user']);

        if ($validated['status'] === 'confirmed' && $booking->payment?->status !== 'paid') {
            abort_unless($booking->payment?->gateway === 'manual', 422, 'Gateway bookings are confirmed automatically after successful payment.');
        }

        DB::transaction(function () use ($booking, $validated, $provider): void {
            if ($validated['status'] === 'confirmed' && $booking->payment?->gateway === 'manual' && $booking->payment->status !== 'paid') {
                $booking->payment->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                    'metadata' => [
                        ...($booking->payment->metadata ?? []),
                        'manual_confirmed_at' => now()->toIso8601String(),
                        'manual_confirmed_by' => $provider->user_id,
                    ],
                ]);
            }

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
                    $booking->customer->notify(new PlatformUpdateNotification(
                        'Loyalty points earned',
                        "You earned {$points} loyalty points from {$provider->user->name}.",
                        'View rewards',
                        rtrim(config('app.frontend_url', config('app.url')), '/').'/customer/rewards',
                        ['booking_id' => $booking->id, 'provider_id' => $provider->id, 'points' => $points],
                    ));
                }

                $referralPoints = (int) ($provider->loyalty_referral_points ?? 0);
                if ($provider->loyalty_enabled && $provider->referral_rewards_enabled && $referralPoints > 0 && $booking->referred_by_customer_id && ! $booking->referral_points_awarded_at) {
                    $referrerLoyalty = Loyalty::firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $booking->referred_by_customer_id]);
                    $referrerLoyalty->increment('points', $referralPoints);
                    $referrerLoyalty->increment('lifetime_points', $referralPoints);
                    LoyaltyTransaction::create(['loyalty_id' => $referrerLoyalty->id, 'booking_id' => $booking->id, 'points' => $referralPoints, 'reason' => 'Referral reward']);
                    $booking->forceFill(['referral_points_awarded_at' => now()])->save();
                    $referrerLoyalty->customer?->notify(new PlatformUpdateNotification(
                        'Referral reward earned',
                        "You earned {$referralPoints} referral points from {$provider->user->name}.",
                        'View rewards',
                        rtrim(config('app.frontend_url', config('app.url')), '/').'/customer/rewards',
                        ['booking_id' => $booking->id, 'provider_id' => $provider->id, 'points' => $referralPoints],
                    ));
                }
            }
        });

        $booking->load(['provider.user', 'customer', 'service', 'payment']);
        app(GoogleCalendarService::class)->syncBookingSafely($booking);
        $booking->customer->notify(new BookingStatusNotification($booking, $validated['status'] === 'confirmed' && $booking->payment?->gateway === 'manual'
            ? "Your manual payment has been confirmed and your booking was accepted by {$booking->provider->user->name}."
            : "Your booking was {$booking->status} by {$booking->provider->user->name}."));

        return $this->success($booking, 'Booking status updated.');
    }

    public function chat(Request $request, Booking $booking): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($booking->provider_id === $provider->id, 403);
        abort_unless(in_array($booking->status, ['pending', 'confirmed'], true), 422, 'Only active bookings can have account chat.');
        $booking->loadMissing(['customer:id,name,email', 'service:id,name']);

        $conversation = LiveChatConversation::firstOrCreate(
            ['booking_id' => $booking->id],
            [
                'provider_id' => $provider->id,
                'customer_id' => $booking->customer_id,
                'visitor_name' => $booking->customer?->name ?? 'Customer',
                'visitor_email' => $booking->customer?->email ?? '',
                'visitor_token' => Str::random(64),
                'status' => 'open',
                'last_message_at' => now(),
            ],
        );

        return $this->success($conversation->load(['booking.service:id,name']), 'Booking chat ready.');
    }
}
