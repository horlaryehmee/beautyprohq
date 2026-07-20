<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Payment;
use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\Service;
use App\Models\User;
use App\Notifications\BookingStatusNotification;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::where('customer_id', $request->user()->id)
            ->with(['provider.user:id,name', 'service', 'payment', 'review'])
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('date')->orderByDesc('time')->paginate($request->integer('per_page', 15));

        return $this->success($bookings->items(), meta: $this->paginationMeta($bookings));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider_id' => ['required', 'integer', 'exists:provider_profiles,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'time' => ['required', 'date_format:H:i'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        return $this->createBooking($request, $validated, $request->user());
    }

    public function guestStore(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider_id' => ['required', 'integer', 'exists:provider_profiles,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'time' => ['required', 'date_format:H:i'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'customer.name' => ['required', 'string', 'max:120'],
            'customer.email' => ['required', 'email:rfc', 'max:255'],
            'customer.phone' => ['nullable', 'string', 'max:40'],
        ]);

        $email = Str::lower(trim($validated['customer']['email']));
        $customer = User::where('email', $email)->first();
        if ($customer && ! $customer->isCustomer()) {
            return response()->json(['message' => 'Please use a customer email address for this booking.'], 422);
        }

        $customer ??= User::create([
            'name' => $validated['customer']['name'],
            'email' => $email,
            'phone' => $validated['customer']['phone'] ?? null,
            'password' => Hash::make(Str::random(32)),
            'role' => 'customer',
            'is_guest' => true,
            'preferred_currency' => config('currencies.default', 'NGN'),
        ]);

        if (! $customer->phone && ! empty($validated['customer']['phone'])) {
            $customer->update(['phone' => $validated['customer']['phone']]);
        }

        unset($validated['customer']);

        return $this->createBooking($request, $validated, $customer);
    }

    private function createBooking(Request $request, array $validated, User $customer): JsonResponse
    {
        $provider = ProviderProfile::directory()->findOrFail($validated['provider_id']);
        if (! $provider->user->hasPaidPlan()) {
            return response()->json(['message' => 'This provider is not accepting direct bookings on BeautyPro HQ.'], 422);
        }
        $service = Service::whereKey($validated['service_id'])->where('provider_id', $provider->id)->where('is_active', true)->firstOrFail();
        $date = Carbon::createFromFormat('Y-m-d H:i', $validated['date'].' '.$validated['time']);
        $end = $date->copy()->addMinutes($service->duration_minutes);

        if ($date->isPast()) {
            return response()->json(['message' => 'Please select a future booking time.'], 422);
        }

        $isWithinAvailability = $provider->availability()
            ->where('is_active', true)
            ->where('day_of_week', $date->dayOfWeek)
            ->where('start_time', '<=', $date->format('H:i:s'))
            ->where('end_time', '>=', $end->format('H:i:s'))
            ->exists();

        if (! $isWithinAvailability) {
            return response()->json(['message' => 'That time is outside the provider’s availability.'], 422);
        }

        $blocked = $provider->blockedDates()->whereDate('date', $date)->get()->contains(function ($block) use ($date, $end): bool {
            if (! $block->start_time || ! $block->end_time) {
                return true;
            }

            return $date->format('H:i:s') < $block->end_time && $end->format('H:i:s') > $block->start_time;
        });

        if ($blocked) {
            return response()->json(['message' => 'That date or time is blocked by the provider.'], 422);
        }

        $booking = DB::transaction(function () use ($provider, $service, $customer, $validated, $end): ?Booking {
            $conflict = Booking::where('provider_id', $provider->id)
                ->whereDate('date', $validated['date'])
                ->whereIn('status', ['pending', 'confirmed'])
                ->where('time', '<', $end->format('H:i:s'))
                ->where(function ($q) use ($validated): void {
                    $q->whereNull('end_time')->orWhere('end_time', '>', $validated['time'].':00');
                })->lockForUpdate()->exists();

            if ($conflict) {
                return null;
            }

            $booking = Booking::create([
                ...$validated,
                'customer_id' => $customer->id,
                'end_time' => $end->format('H:i:s'),
                'status' => 'pending',
            ]);
            Payment::create([
                'booking_id' => $booking->id,
                'provider_id' => $provider->id,
                'amount' => $service->price,
                'currency' => $service->currency ?? $provider->default_currency ?? config('currencies.default', 'NGN'),
                'status' => 'pending',
            ]);

            return $booking;
        });

        if (! $booking) {
            return response()->json(['message' => 'That time has just been booked. Please choose another time.'], 409);
        }

        $booking->load(['provider.user', 'customer', 'service', 'payment']);
        $provider->user->notify(new BookingStatusNotification($booking, "{$customer->name} requested a new booking."));

        return $this->success($booking, 'Booking request sent to the provider.', 201);
    }

    public function show(Request $request, Booking $booking): JsonResponse
    {
        abort_unless($booking->customer_id === $request->user()->id || $request->user()->isAdmin(), 403);

        return $this->success($booking->load(['provider.user:id,name', 'customer:id,name,email', 'service', 'payment', 'review']));
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        abort_unless($booking->customer_id === $request->user()->id, 403);
        abort_unless(in_array($booking->status, ['pending', 'confirmed'], true), 422, 'Only pending or confirmed bookings can be cancelled.');

        $booking->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        $booking->load(['provider.user', 'customer', 'service']);
        $booking->provider->user->notify(new BookingStatusNotification($booking, "{$booking->customer->name} cancelled a booking."));

        return $this->success($booking, 'Booking cancelled.');
    }

    public function review(Request $request, ProviderProfile $provider): JsonResponse
    {
        $validated = $request->validate([
            'booking_id' => ['nullable', 'integer', 'exists:bookings,id'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'comment' => ['nullable', 'string', 'max:3000'],
        ]);

        $bookingQuery = Booking::where('customer_id', $request->user()->id)
            ->where('provider_id', $provider->id)->where('status', 'completed')->whereDoesntHave('review');
        $booking = isset($validated['booking_id']) ? $bookingQuery->whereKey($validated['booking_id'])->firstOrFail() : $bookingQuery->latest('date')->firstOrFail();

        $review = Review::create([
            'booking_id' => $booking->id,
            'provider_id' => $provider->id,
            'customer_id' => $request->user()->id,
            'rating' => $validated['rating'],
            'comment' => $validated['comment'] ?? null,
        ]);

        return $this->success($review->load('customer:id,name'), 'Thank you for your review.', 201);
    }
}
