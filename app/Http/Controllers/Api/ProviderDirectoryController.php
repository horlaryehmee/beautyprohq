<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\ProfileView;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Service;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProviderDirectoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category' => ['nullable', 'string', 'max:100'],
            'location' => ['nullable', 'string', 'max:100'],
            'verified' => ['nullable', 'boolean'],
            'rating' => ['nullable', 'numeric', 'between:0,5'],
            'service_type' => ['nullable', 'string', 'max:50'],
            'sort' => ['nullable', 'in:rating,newest,name'],
            'per_page' => ['nullable', 'integer', 'between:1,48'],
        ]);

        $query = ProviderProfile::directory()
            ->with(['user:id,name', 'category:id,name,slug', 'services' => fn ($q) => $q->where('is_active', true)->orderBy('price')->limit(3)]);

        $query->when($validated['search'] ?? null, function (Builder $query, string $search): void {
            $query->where(function (Builder $q) use ($search): void {
                $q->where('profession', 'like', "%{$search}%")
                    ->orWhere('location', 'like', "%{$search}%")
                    ->orWhereHas('user', fn (Builder $u) => $u->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('services', fn (Builder $s) => $s->where('name', 'like', "%{$search}%"));
            });
        });
        $query->when($validated['category'] ?? null, function (Builder $q, string $v): void {
            $q->whereHas('category', fn (Builder $category) => $category->where('slug', $v)->orWhere('name', $v));
        });
        $query->when($validated['service_type'] ?? null, fn (Builder $q, string $v) => $q->whereHas('services', fn (Builder $s) => $s->where('service_type', $v)->where('is_active', true)));
        $query->when($validated['location'] ?? null, fn (Builder $q, string $v) => $q->where('location', 'like', "%{$v}%"));
        $query->when(array_key_exists('verified', $validated), fn (Builder $q) => $q->where('verified', $validated['verified']));
        $query->when($validated['rating'] ?? null, fn (Builder $q, $v) => $q->where('rating', '>=', $v));

        match ($validated['sort'] ?? 'rating') {
            'newest' => $query->latest(),
            'name' => $query->join('users', 'users.id', '=', 'provider_profiles.user_id')->orderBy('users.name')->select('provider_profiles.*'),
            default => $query->orderByDesc('verified')->orderByDesc('rating'),
        };

        $providers = $query->paginate($validated['per_page'] ?? 12);

        return $this->success($providers->items(), meta: $this->paginationMeta($providers) + [
            'filters' => [
                'categories' => ProviderCategory::where('is_active', true)->withCount(['providers' => fn ($q) => $q->directory()])->orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'slug']),
                'service_types' => Service::where('is_active', true)->distinct()->orderBy('service_type')->pluck('service_type'),
                'locations' => ProviderProfile::directory()->whereNotNull('location')->distinct()->orderBy('location')->pluck('location'),
            ],
        ]);
    }

    public function categories(): JsonResponse
    {
        return $this->success(
            ProviderCategory::where('is_active', true)
                ->withCount(['providers' => fn ($q) => $q->directory()])
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get()
        );
    }

    public function show(Request $request, ProviderProfile $provider): JsonResponse
    {
        abort_unless($provider->is_listed && $provider->user->is_active, 404);

        $provider->increment('profile_views');
        ProfileView::create([
            'provider_id' => $provider->id,
            'viewer_id' => $request->user()?->id,
            'session_id' => $request->hasSession() ? $request->session()->getId() : null,
            'viewed_on' => today(),
        ]);

        $data = $provider->fresh()->load([
            'user:id,name',
            'user.activeSubscription.planDefinition',
            'category:id,name,slug',
            'services' => fn ($q) => $q->where('is_active', true),
            'portfolioItems' => fn ($q) => $q->orderBy('sort_order'),
            'digitalProducts' => fn ($q) => $q->where('is_active', true),
            'availability' => fn ($q) => $q->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time'),
            'reviews' => fn ($q) => $q->where('is_approved', true)->with('customer:id,name')->latest()->limit(10),
        ]);
        $hasPaidPlan = $data->user->hasPaidPlan();
        if (! $hasPaidPlan) {
            $data->setRelation('digitalProducts', collect());
        }
        $data->setAttribute('is_saved', $request->user()?->isCustomer() ? $request->user()->savedProviders()->whereKey($provider->id)->exists() : false);
        $data->setAttribute('can_book_directly', $hasPaidPlan);
        $data->setAttribute('can_show_digital_products', $hasPaidPlan);

        return $this->success($data);
    }

    public function services(ProviderProfile $provider): JsonResponse
    {
        return $this->success($provider->services()->where('is_active', true)->orderBy('name')->get());
    }

    public function availability(Request $request, ProviderProfile $provider): JsonResponse
    {
        $validated = $request->validate(['date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:today']]);

        if (! isset($validated['date'])) {
            return $this->success($provider->availability()->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time')->get());
        }

        $date = Carbon::createFromFormat('Y-m-d', $validated['date'])->startOfDay();
        $slots = $provider->availability()->where('is_active', true)->where('day_of_week', $date->dayOfWeek)->orderBy('start_time')->get();
        $blocks = $provider->blockedDates()->whereDate('date', $date)->get();
        $bookings = Booking::where('provider_id', $provider->id)->whereDate('date', $date)->whereIn('status', ['pending', 'confirmed'])->get(['time', 'end_time']);
        $bookingBlocks = $bookings->map(fn (Booking $booking) => [
            'start_time' => $booking->time,
            'end_time' => $booking->end_time,
            'reason' => 'booked',
        ]);

        return $this->success([
            'date' => $date->toDateString(),
            'day_of_week' => $date->dayOfWeek,
            'slots' => $slots,
            'blocked' => $blocks->concat($bookingBlocks)->values(),
            'booked_times' => $bookings->pluck('time'),
        ]);
    }

    public function reviews(Request $request, ProviderProfile $provider): JsonResponse
    {
        $reviews = $provider->reviews()->where('is_approved', true)->with('customer:id,name')->latest()->paginate(10);

        return $this->success($reviews->items(), meta: $this->paginationMeta($reviews));
    }
}
