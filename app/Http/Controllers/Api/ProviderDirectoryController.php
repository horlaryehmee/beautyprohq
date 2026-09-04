<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\ProfileView;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Service;
use App\Notifications\ProviderContactEnquiryNotification;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\ValidationException;

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
            'shuffle_seed' => ['nullable', 'integer', 'between:1,2147483646'],
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

        $hasFilters = filled($validated['search'] ?? null)
            || filled($validated['category'] ?? null)
            || filled($validated['location'] ?? null)
            || array_key_exists('verified', $validated)
            || array_key_exists('rating', $validated)
            || filled($validated['service_type'] ?? null)
            || filled($validated['sort'] ?? null);
        $randomized = ! $hasFilters;
        $shuffleSeed = (int) ($validated['shuffle_seed'] ?? random_int(1, 2147483646));

        if ($randomized) {
            $query->inRandomOrder((string) $shuffleSeed);
        } else {
            match ($validated['sort'] ?? 'rating') {
                'newest' => $query->latest()->orderByDesc('provider_profiles.id'),
                'name' => $query->join('users', 'users.id', '=', 'provider_profiles.user_id')->orderBy('users.name')->orderBy('provider_profiles.id')->select('provider_profiles.*'),
                default => $query->orderByDesc('verified')->orderByDesc('rating')->orderBy('provider_profiles.id'),
            };
        }

        $providers = $query->paginate($validated['per_page'] ?? 12);

        return $this->success($providers->items(), meta: $this->paginationMeta($providers) + [
            'filters' => $this->directoryFilters(),
            'randomized' => $randomized,
            'shuffle_seed' => $randomized ? $shuffleSeed : null,
        ])->header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
    }

    public function categories(): JsonResponse
    {
        return $this->success($this->directoryFilters()['categories'])
            ->header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    }

    public function show(Request $request, ProviderProfile $provider): JsonResponse
    {
        abort_unless($provider->is_listed && $provider->account_approved_at && $provider->user->is_active, 404);

        $this->recordProfileView($request, $provider);

        return $this->success($this->profileData($request, $provider));
    }

    public function adminPreview(Request $request, ProviderProfile $provider): JsonResponse
    {
        return $this->success($this->profileData($request, $provider, true));
    }

    private function profileData(Request $request, ProviderProfile $provider, bool $adminPreview = false): ProviderProfile
    {

        $data = $provider->fresh()->load([
            'user:id,name',
            'user.activeSubscription.planDefinition',
            'category:id,name,slug',
            'services' => fn ($q) => $q->where('is_active', true),
            'portfolioItems' => fn ($q) => $q->orderBy('sort_order'),
            'digitalProducts' => fn ($q) => $q->where('is_active', true),
            'paymentAccounts' => fn ($q) => $q->where(function ($query): void {
                $query->where('enabled', true)->orWhere('is_connected', true);
            }),
            'availability' => fn ($q) => $q->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time'),
            'reviews' => fn ($q) => $q->where('is_approved', true)->with('customer:id,name')->latest()->limit(10),
        ]);
        $hasPaidPlan = $data->user->hasPaidPlan();
        if (! $hasPaidPlan) {
            $data->setRelation('digitalProducts', collect());
        }
        $data->setAttribute('is_saved', ! $adminPreview && $request->user()?->isCustomer() ? $request->user()->savedProviders()->whereKey($provider->id)->exists() : false);
        $data->setAttribute('can_book_directly', $hasPaidPlan);
        $data->setAttribute('can_show_digital_products', $hasPaidPlan);
        $data->setAttribute('is_admin_preview', $adminPreview);
        $data->setAttribute('referral_rewards_available', (bool) (
            $data->loyalty_enabled
            && $data->referral_rewards_enabled
            && (int) ($data->loyalty_referral_points ?? 0) > 0
        ));
        $data->setAttribute('payment_methods', $hasPaidPlan ? $data->paymentAccounts->map(fn ($account) => [
            'gateway' => $account->gateway,
            'label' => match ($account->gateway) {
                'paystack' => 'Paystack',
                'stripe' => 'Stripe',
                'paypal' => 'PayPal',
                'manual' => 'Manual payment',
                default => ucfirst((string) $account->gateway),
            },
        ])->values() : []);
        $data->makeHidden('paymentAccounts');

        return $data;
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

    public function contact(Request $request, ProviderProfile $provider): JsonResponse
    {
        abort_unless($provider->is_listed && $provider->account_approved_at && $provider->user->is_active, 404);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'message' => ['required', 'string', 'min:10', 'max:3000'],
            'company_website' => ['nullable', 'string', 'max:255'],
            'submitted_at' => ['required', 'integer'],
        ]);

        if (filled($validated['company_website'] ?? null) || now()->timestamp - (int) $validated['submitted_at'] < 4) {
            throw ValidationException::withMessages(['message' => 'Your message could not be sent. Please try again.']);
        }

        if (preg_match_all('/https?:\/\//i', $validated['message']) > 2) {
            throw ValidationException::withMessages(['message' => 'Please remove extra links from your message.']);
        }

        $enquiry = $provider->contactEnquiries()->create([
            'user_id' => $request->user()?->id,
            'reason' => 'Provider profile enquiry',
            'name' => $validated['name'],
            'email' => strtolower($validated['email']),
            'phone' => $validated['phone'] ?? null,
            'message' => $validated['message'],
        ]);

        $recipient = $provider->contact_email ?: $provider->user->email;

        try {
            Notification::route('mail', $recipient)->notify(new ProviderContactEnquiryNotification($provider->loadMissing('user:id,name,email'), $enquiry));
        } catch (\Throwable $exception) {
            Log::warning('Provider contact enquiry email failed.', [
                'provider_id' => $provider->id,
                'contact_enquiry_id' => $enquiry->id,
                'exception' => $exception::class,
            ]);

            return $this->success(null, 'Your message was saved, but email delivery failed. The provider can still review it from BeautyPro HQ.', 202);
        }

        return $this->success(null, 'Your message has been sent to the provider.', 201);
    }

    private function directoryFilters(): array
    {
        return Cache::flexible('public.directory.filters.v2', [300, 900], fn (): array => [
            'categories' => ProviderCategory::where('is_active', true)
                ->withCount(['providers' => fn ($q) => $q->directory()])
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get(['id', 'name', 'slug', 'cover_image'])
                ->toArray(),
            'service_types' => Service::where('is_active', true)->distinct()->orderBy('service_type')->pluck('service_type')->values()->all(),
            'locations' => ProviderProfile::directory()->whereNotNull('location')->distinct()->orderBy('location')->pluck('location')->values()->all(),
        ]);
    }

    private function recordProfileView(Request $request, ProviderProfile $provider): void
    {
        $identity = $request->user()
            ? 'user:'.$request->user()->id
            : 'guest:'.($request->hasSession() ? $request->session()->getId() : $request->ip().'|'.$request->userAgent());
        $fingerprint = hash('sha256', $identity);
        $key = "profile-view:{$provider->id}:".today()->toDateString().":{$fingerprint}";

        if (! Cache::add($key, true, now()->endOfDay())) {
            return;
        }

        $provider->increment('profile_views');
        ProfileView::create([
            'provider_id' => $provider->id,
            'viewer_id' => $request->user()?->id,
            'session_id' => $fingerprint,
            'viewed_on' => today(),
        ]);
    }
}
