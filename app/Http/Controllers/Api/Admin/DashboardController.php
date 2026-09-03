<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterUnsubscribe;
use App\Models\Payment;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\Announcement;
use App\Models\Event;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Notifications\PlatformUpdateNotification;
use App\Services\AccountDeletionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class DashboardController extends Controller
{
    public function index(): JsonResponse
    {
        return $this->success([
            'stats' => [
                'users' => User::count(),
                'providers' => User::where('role', 'provider')->count(),
                'customers' => User::where('role', 'customer')->count(),
                'verified_providers' => ProviderProfile::where('verified', true)->count(),
                'pending_verifications' => VerificationRequest::where('status', 'pending')->count(),
                'bookings' => Booking::count(),
                'payment_volume' => Payment::where('status', 'paid')->sum('amount'),
            ],
            'recent_users' => User::latest()->limit(6)->get(),
            'recent_bookings' => Booking::with(['provider.user:id,name', 'customer:id,name', 'service:id,name'])->latest()->limit(6)->get(),
            'pending_verifications' => VerificationRequest::where('status', 'pending')->with('provider.user:id,name,email')->latest()->limit(6)->get(),
            'recent_activity' => $this->activityFeed(10),
        ]);
    }

    public function activity(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['nullable', Rule::in(['all', 'users', 'bookings', 'payments', 'subscriptions', 'listings', 'content', 'announcements'])],
            'search' => ['nullable', 'string', 'max:120'],
            'status' => ['nullable', 'string', 'max:80'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'sort' => ['nullable', Rule::in(['created_at', 'type', 'status', 'actor'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'between:5,100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $perPage = $validated['per_page'] ?? 20;
        $page = $validated['page'] ?? 1;
        $query = DB::query()->fromSub($this->activityQuery($validated['type'] ?? 'all'), 'activity');

        if (filled($validated['search'] ?? null)) {
            $search = '%'.str_replace(['%', '_'], ['\%', '\_'], $validated['search']).'%';
            $query->where(function ($nested) use ($search): void {
                $nested->where('title', 'like', $search)
                    ->orWhere('description', 'like', $search)
                    ->orWhere('actor', 'like', $search)
                    ->orWhere('actor_email', 'like', $search)
                    ->orWhere('status', 'like', $search);
            });
        }

        $query
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($validated['date_from'] ?? null, fn ($query, $date) => $query->where('created_at', '>=', $date.' 00:00:00'))
            ->when($validated['date_to'] ?? null, fn ($query, $date) => $query->where('created_at', '<=', $date.' 23:59:59'));

        $sort = $validated['sort'] ?? 'created_at';
        $direction = $validated['direction'] ?? 'desc';
        $paginator = $query
            ->orderBy($sort, $direction)
            ->orderBy('sort_id', $direction)
            ->paginate($perPage, ['*'], 'page', $page);

        return $this->success($paginator->items(), meta: $this->paginationMeta($paginator) + [
            'has_more_pages' => $paginator->hasMorePages(),
            'next_page' => $paginator->hasMorePages() ? $paginator->currentPage() + 1 : null,
            'filters' => [
                'statuses' => $this->activityStatuses(),
            ],
        ]);
    }

    public function waitlist(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'sort' => ['nullable', Rule::in(['subscribed_at', 'name', 'email', 'id'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
            'per_page' => ['nullable', 'integer', 'between:10,100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $perPage = $validated['per_page'] ?? 20;

        $subscribers = $this->subscriberQuery($validated)
            ->orderBy($validated['sort'] ?? 'subscribed_at', $validated['direction'] ?? 'desc')
            ->orderBy('id', $validated['direction'] ?? 'desc')
            ->paginate($perPage, ['*'], 'page', $validated['page'] ?? 1);

        return $this->success([
            'subscribers' => $subscribers->items(),
            'stats' => [
                'total' => NewsletterSubscriber::whereNull('unsubscribed_at')->count(),
                'active' => NewsletterSubscriber::whereNull('unsubscribed_at')->count(),
                'unsubscribed' => NewsletterUnsubscribe::count(),
                'today' => NewsletterSubscriber::whereNull('unsubscribed_at')->whereDate('subscribed_at', today())->count(),
            ],
            'pagination' => $this->paginationMeta($subscribers),
        ], meta: $this->paginationMeta($subscribers));
    }

    private function subscriberQuery(array $filters)
    {
        return NewsletterSubscriber::query()
            ->whereNull('unsubscribed_at')
            ->when($filters['search'] ?? null, function ($query, $search): void {
                $search = '%'.str_replace(['%', '_'], ['\%', '\_'], $search).'%';
                $query->where(fn ($nested) => $nested
                ->where('name', 'like', $search)
                ->orWhere('email', 'like', $search));
            })
            ->when($filters['date_from'] ?? null, fn ($query, $date) => $query->where('subscribed_at', '>=', $date.' 00:00:00'))
            ->when($filters['date_to'] ?? null, fn ($query, $date) => $query->where('subscribed_at', '<=', $date.' 23:59:59'));
    }

    public function updateSubscriber(Request $request, NewsletterSubscriber $subscriber): JsonResponse
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:255', Rule::unique('newsletter_subscribers', 'email')->ignore($subscriber->id)],
            'status' => ['required', Rule::in(['active', 'unsubscribed'])],
        ]);

        if ($data['status'] === 'unsubscribed') {
            NewsletterUnsubscribe::record($subscriber->email);
            $subscriber->delete();

            return $this->success(null, 'Subscriber unsubscribed and removed from the active list.');
        }

        $subscriber->forceFill([
            'name' => $data['name'] ?? null,
            'email' => Str::lower(trim($data['email'])),
            'subscribed_at' => $subscriber->subscribed_at ?: now(),
            'unsubscribed_at' => null,
        ])->save();

        return $this->success($subscriber->fresh(), 'Subscriber updated.');
    }

    public function destroySubscriber(NewsletterSubscriber $subscriber): JsonResponse
    {
        $subscriber->delete();

        return $this->success(null, 'Subscriber deleted.');
    }

    public function exportWaitlist(Request $request)
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'sort' => ['nullable', Rule::in(['subscribed_at', 'name', 'email'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);
        $filename = 'beautyprohq-waitlist-'.now()->format('Y-m-d-His').'.csv';
        $subscribers = $this->subscriberQuery($validated)
            ->orderBy($validated['sort'] ?? 'subscribed_at', $validated['direction'] ?? 'desc')
            ->orderBy('id', $validated['direction'] ?? 'desc')
            ->get();

        return response()->streamDownload(function () use ($subscribers): void {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Name', 'Email', 'Status', 'Subscribed at', 'Unsubscribed at']);

            foreach ($subscribers as $subscriber) {
                fputcsv($handle, [
                    $subscriber->name,
                    $subscriber->email,
                    $subscriber->unsubscribed_at ? 'Unsubscribed' : 'Active',
                    optional($subscriber->subscribed_at)->toDateTimeString(),
                    optional($subscriber->unsubscribed_at)->toDateTimeString(),
                ]);
            }

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    public function users(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'role' => ['nullable', Rule::in(['provider', 'customer', 'admin'])],
            'is_active' => ['nullable', 'boolean'],
            'verification' => ['nullable', Rule::in(['verified', 'unverified'])],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'sort' => ['nullable', Rule::in(['created_at', 'name', 'email', 'id'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $users = User::with('providerProfile')
            ->when($validated['role'] ?? null, fn ($q, $role) => $q->where('role', $role))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($validated['search'] ?? null, fn ($q, $search) => $q->where(fn ($x) => $x->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->when($validated['verification'] ?? null, function ($query, $verification): void {
                if ($verification === 'verified') {
                    $query->whereHas('providerProfile', fn ($q) => $q->where('verified', true));
                } else {
                    $query->where(function ($q): void {
                        $q->whereDoesntHave('providerProfile')
                            ->orWhereHas('providerProfile', fn ($nested) => $nested->where('verified', false));
                    });
                }
            })
            ->when($validated['date_from'] ?? null, fn ($q, $date) => $q->where('users.created_at', '>=', $date.' 00:00:00'))
            ->when($validated['date_to'] ?? null, fn ($q, $date) => $q->where('users.created_at', '<=', $date.' 23:59:59'))
            ->orderBy($validated['sort'] ?? 'created_at', $validated['direction'] ?? 'desc')
            ->orderBy('id', $validated['direction'] ?? 'desc')
            ->paginate($this->perPage($request, 20, 100));

        return $this->success($users->items(), meta: $this->paginationMeta($users));
    }

    public function showUser(User $user): JsonResponse
    {
        $user->load([
            'providerProfile.category',
            'providerProfile.services',
            'providerProfile.portfolioItems' => fn ($query) => $query->orderBy('sort_order'),
            'providerProfile.availability' => fn ($query) => $query->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time'),
            'providerProfile.bookings' => fn ($query) => $query->with(['customer:id,name,email,phone,created_at', 'service:id,name,price', 'payment:id,booking_id,status,amount,currency'])->latest()->limit(50),
            'providerProfile.verificationRequests' => fn ($query) => $query->latest(),
            'providerProfile.digitalProducts',
            'providerProfile.paymentAccounts',
            'providerProfile.reviews' => fn ($query) => $query->latest()->limit(10),
            'customerBookings.service:id,name',
            'customerBookings.provider.user:id,name',
            'customerBookings.payment:id,booking_id,status,amount,currency',
            'savedProviders.user:id,name',
            'loyalties',
            'subscriptions' => fn ($query) => $query->latest()->limit(5),
            'subscriptionPayments' => fn ($query) => $query->latest()->limit(10),
        ]);

        return $this->success($user->setAttribute('platform_usage', $this->userUsage($user)));
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['prohibited'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'role' => ['sometimes', Rule::in(['provider', 'customer', 'admin'])],
            'is_active' => ['sometimes', 'boolean'],
            'email_verified' => ['prohibited'],
            'provider_profile' => ['sometimes', 'array'],
            'provider_profile.provider_category_id' => ['nullable', 'integer', 'exists:provider_categories,id'],
            'provider_profile.profession' => ['nullable', 'string', 'max:120'],
            'provider_profile.bio' => ['nullable', 'string', 'max:5000'],
            'provider_profile.location' => ['nullable', 'string', 'max:180'],
            'provider_profile.country' => ['nullable', 'string', 'max:100'],
            'provider_profile.city' => ['nullable', 'string', 'max:100'],
            'provider_profile.profile_photo' => ['nullable', 'string', 'max:500'],
            'provider_profile.cover_image' => ['nullable', 'string', 'max:1000'],
            'provider_profile.contact_email' => ['nullable', 'email', 'max:255'],
            'provider_profile.contact_phone' => ['nullable', 'string', 'max:40'],
            'provider_profile.website' => ['nullable', 'url:http,https', 'max:500'],
            'provider_profile.default_currency' => ['nullable', Rule::in(array_keys(config('currencies.supported', [])))],
            'provider_profile.base_price' => ['nullable', 'numeric', 'min:0', 'max:999999999'],
            'provider_profile.verified' => ['sometimes', 'boolean'],
            'provider_profile.is_listed' => ['sometimes', 'boolean'],
            'provider_profile.is_pro_of_week' => ['sometimes', 'boolean'],
            'provider_profile.social_links' => ['nullable', 'array'],
            'provider_profile.portfolio_links' => ['nullable', 'array'],
            'provider_profile.digital_product_links' => ['nullable', 'array'],
            'provider_profile.availability' => ['nullable', 'array'],
            'provider_profile.availability.*.day_of_week' => ['required_with:provider_profile.availability', 'integer', 'between:0,6'],
            'provider_profile.availability.*.start_time' => ['required_with:provider_profile.availability', 'date_format:H:i'],
            'provider_profile.availability.*.end_time' => ['required_with:provider_profile.availability', 'date_format:H:i', 'after:start_time'],
            'verification_status' => ['sometimes', Rule::in(['approved', 'rejected', 'pending'])],
            'verification_notes' => ['nullable', 'string', 'max:5000'],
        ]);

        DB::transaction(function () use ($request, $user, $validated): void {
            $userData = collect($validated)->only(['name', 'phone', 'role', 'is_active'])->all();

            if ($user->is($request->user())) {
                unset($userData['role'], $userData['is_active']);
            }

            if ($userData !== []) {
                $user->update($userData);
            }

            $shouldHaveProviderProfile = ($validated['role'] ?? $user->role) === 'provider' || isset($validated['provider_profile']) || isset($validated['verification_status']);
            if ($shouldHaveProviderProfile && ! $user->providerProfile) {
                $user->load('providerProfile');
                if (! $user->providerProfile) {
                    $base = Str::slug($user->name) ?: 'beauty-pro';
                    $slug = $base.'-'.$user->id;
                    $user->providerProfile()->create(['slug' => $slug, 'profession' => 'Beauty Professional']);
                    $user->load('providerProfile');
                }
            }

            if (isset($validated['provider_profile']) && $user->providerProfile) {
                if (($validated['provider_profile']['is_pro_of_week'] ?? false) === true) {
                    ProviderProfile::where('id', '!=', $user->providerProfile->id)->update(['is_pro_of_week' => false]);
                }
                $availability = $validated['provider_profile']['availability'] ?? null;
                $profileData = $validated['provider_profile'];
                unset($profileData['availability']);
                $user->providerProfile->update($profileData);
                if (is_array($availability)) {
                    $user->providerProfile->availability()->delete();
                    foreach ($availability as $slot) {
                        $user->providerProfile->availability()->create($slot + ['is_active' => true]);
                    }
                }
            }

            if (isset($validated['verification_status']) && $user->providerProfile) {
                $status = $validated['verification_status'];
                $user->providerProfile->update(['verified' => $status === 'approved']);
                $latestRequest = $user->providerProfile->verificationRequests()->latest()->first();
                $requestModel = $latestRequest
                    ?? $user->providerProfile->verificationRequests()->make([
                        'portfolio_links' => $user->providerProfile->portfolio_links ?? [],
                        'certification_files' => $latestRequest?->certification_files ?? [],
                        'license_files' => $latestRequest?->license_files ?? [],
                        'social_links' => $user->providerProfile->social_links ?? [],
                        'professional_info' => collect([$user->providerProfile->profession, $user->providerProfile->location, $user->providerProfile->bio])->filter()->implode("\n\n"),
                    ]);
                $requestModel->fill([
                    'status' => $status,
                    'admin_notes' => $validated['verification_notes'] ?? $requestModel->admin_notes,
                    'reviewed_by' => $request->user()->id,
                    'reviewed_at' => now(),
                ])->save();
                Cache::forget('public.home.payload.v6');
                Cache::forget('public.home.payload.v5');
                \Illuminate\Support\Facades\Artisan::call('cache:clear');
            }

            if (isset($validated['is_active']) && ! $validated['is_active']) {
                $user->tokens()->delete();
            }
        });

        return $this->success($user->fresh()->load([
            'providerProfile.category',
            'providerProfile.availability' => fn ($query) => $query->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time'),
            'providerProfile.bookings' => fn ($query) => $query->with(['customer:id,name,email,phone,created_at', 'service:id,name,price', 'payment:id,booking_id,status,amount,currency'])->latest()->limit(50),
            'providerProfile.verificationRequests' => fn ($query) => $query->latest(),
        ]), 'User updated.');
    }

    public function destroyUser(Request $request, User $user, AccountDeletionService $accounts): JsonResponse
    {
        $validated = $request->validate([
            'confirmation' => ['required', 'string', Rule::in(['DELETE'])],
        ]);

        if ($user->is($request->user())) {
            return response()->json(['message' => 'You cannot delete your own admin account.'], 422);
        }

        $accounts->delete($user);

        return $this->success(null, 'User deleted.');
    }

    private function userUsage(User $user): array
    {
        $profile = $user->providerProfile;
        $customerBookings = $user->customerBookings;
        $providerBookings = $profile?->bookings ?? collect();
        $subscriptions = $user->subscriptions;
        $subscriptionPayments = $user->subscriptionPayments;
        $activeSubscription = $subscriptions->firstWhere('status', 'active') ?? $subscriptions->first();

        return [
            'account' => [
                'joined_at' => optional($user->created_at)->toDateTimeString(),
                'last_login_at' => optional($user->last_login_at)->toDateTimeString(),
                'email_verified' => filled($user->email_verified_at),
                'two_factor_enabled' => (bool) $user->two_factor_enabled,
                'is_demo' => (bool) $user->is_demo,
                'is_guest' => (bool) $user->is_guest,
            ],
            'provider' => [
                'onboarding_complete' => (bool) ($profile?->onboarding_complete ?? false),
                'onboarding_completed_at' => optional($profile?->onboarding_completed_at)->toDateTimeString(),
                'terms_accepted_at' => optional($profile?->terms_accepted_at)->toDateTimeString(),
                'listed' => (bool) ($profile?->is_listed ?? false),
                'verified' => (bool) ($profile?->verified ?? false),
                'services' => (int) ($profile?->services?->count() ?? 0),
                'active_services' => (int) ($profile?->services?->where('is_active', true)->count() ?? 0),
                'portfolio_links' => count($profile?->portfolio_links ?? []),
                'booking_questions' => count($profile?->booking_form_fields ?? []),
                'digital_products' => (int) ($profile?->digitalProducts?->count() ?? 0),
                'active_digital_products' => (int) ($profile?->digitalProducts?->where('is_active', true)->count() ?? 0),
                'payment_accounts' => (int) ($profile?->paymentAccounts?->count() ?? 0),
                'bookings' => (int) $providerBookings->count(),
                'upcoming_bookings' => (int) $providerBookings->whereIn('status', ['pending', 'confirmed'])->filter(fn ($booking) => optional($booking->date)->isFuture() || optional($booking->date)->isToday())->count(),
                'completed_bookings' => (int) $providerBookings->where('status', 'completed')->count(),
                'paid_revenue' => (float) $providerBookings->pluck('payment')->filter(fn ($payment) => $payment?->status === 'paid')->sum('amount'),
                'reviews' => (int) ($profile?->review_count ?? $profile?->reviews?->count() ?? 0),
                'rating' => (float) ($profile?->rating ?? 0),
            ],
            'customer' => [
                'bookings' => (int) $customerBookings->count(),
                'upcoming_bookings' => (int) $customerBookings->whereIn('status', ['pending', 'confirmed'])->filter(fn ($booking) => optional($booking->date)->isFuture() || optional($booking->date)->isToday())->count(),
                'completed_bookings' => (int) $customerBookings->where('status', 'completed')->count(),
                'paid_spend' => (float) $customerBookings->pluck('payment')->filter(fn ($payment) => $payment?->status === 'paid')->sum('amount'),
                'saved_providers' => (int) $user->savedProviders->count(),
                'loyalty_programs' => (int) $user->loyalties->count(),
                'loyalty_points' => (int) $user->loyalties->sum('points'),
            ],
            'subscription' => [
                'plan' => $activeSubscription?->plan,
                'status' => $activeSubscription?->status,
                'amount' => (float) ($activeSubscription?->amount ?? 0),
                'renews_at' => optional($activeSubscription?->renews_at)->toDateTimeString(),
                'payments' => (int) $subscriptionPayments->count(),
                'paid_total' => (float) $subscriptionPayments->where('status', 'paid')->sum('amount'),
                'latest_payment_status' => $subscriptionPayments->first()?->status,
            ],
        ];
    }

    public function directory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'verified' => ['nullable', 'boolean'],
            'account_approval' => ['nullable', Rule::in(['pending', 'approved', 'declined'])],
            'is_listed' => ['nullable', 'boolean'],
            'category_id' => ['nullable', 'integer', 'exists:provider_categories,id'],
            'date_from' => ['nullable', 'date_format:Y-m-d'],
            'date_to' => ['nullable', 'date_format:Y-m-d'],
            'sort' => ['nullable', Rule::in(['created_at', 'profession', 'location', 'rating', 'id'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $providers = ProviderProfile::with(['user:id,name,email,is_active', 'category:id,name,slug', 'services'])
            ->when(array_key_exists('verified', $validated) && $validated['verified'] !== null, fn ($q) => $q->where('verified', $request->boolean('verified')))
            ->when(($validated['account_approval'] ?? null) === 'pending', fn ($q) => $q
                ->whereNotNull('onboarding_completed_at')
                ->whereNull('account_approved_at')
                ->whereNull('account_declined_at'))
            ->when(($validated['account_approval'] ?? null) === 'approved', fn ($q) => $q->whereNotNull('account_approved_at'))
            ->when(($validated['account_approval'] ?? null) === 'declined', fn ($q) => $q->whereNotNull('account_declined_at')->whereNull('account_approved_at'))
            ->when(array_key_exists('is_listed', $validated) && $validated['is_listed'] !== null, fn ($q) => $q->where('is_listed', $request->boolean('is_listed')))
            ->when($validated['category_id'] ?? null, fn ($q) => $q->where('provider_category_id', $validated['category_id']))
            ->when($validated['search'] ?? null, fn ($q, $search) => $q->where(fn ($x) => $x
                ->where('profession', 'like', "%{$search}%")
                ->orWhere('location', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))
            ))
            ->when($validated['date_from'] ?? null, fn ($q, $date) => $q->where('created_at', '>=', $date.' 00:00:00'))
            ->when($validated['date_to'] ?? null, fn ($q, $date) => $q->where('created_at', '<=', $date.' 23:59:59'))
            ->orderBy($validated['sort'] ?? 'created_at', $validated['direction'] ?? 'desc')
            ->orderBy('id', $validated['direction'] ?? 'desc')
            ->paginate($this->perPage($request, 20, 100));

        return $this->success($providers->items(), meta: $this->paginationMeta($providers) + [
            'categories' => $this->categoryTotals(),
        ]);
    }

    public function updateProvider(Request $request, ProviderProfile $provider): JsonResponse
    {
        $validated = $request->validate([
            'provider_category_id' => ['sometimes', 'nullable', 'integer', 'exists:provider_categories,id'],
            'is_listed' => ['sometimes', 'boolean'],
            'is_pro_of_week' => ['sometimes', 'boolean'],
            'account_approved' => ['sometimes', 'boolean'],
            'account_declined' => ['sometimes', 'boolean'],
            'account_review_notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'verified' => ['sometimes', 'boolean'],
            'profession' => ['sometimes', 'nullable', 'string', 'max:120'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:180'],
            'profile_photo' => ['sometimes', 'nullable', 'string', 'max:500'],
            'social_links' => ['sometimes', 'nullable', 'array'],
            'portfolio_links' => ['sometimes', 'nullable', 'array'],
            'digital_product_links' => ['sometimes', 'nullable', 'array'],
        ]);
        if (($validated['is_pro_of_week'] ?? false) === true) {
            ProviderProfile::where('id', '!=', $provider->id)->update(['is_pro_of_week' => false]);
        }
        $wasAccountApproved = filled($provider->account_approved_at);
        $wasAccountDeclined = filled($provider->account_declined_at);
        if (array_key_exists('account_approved', $validated)) {
            $validated['account_approved_at'] = $validated['account_approved'] ? ($provider->account_approved_at ?? now()) : null;
            if ($validated['account_approved']) {
                $validated['account_declined_at'] = null;
                $validated['is_listed'] = true;
            } else {
                $validated['is_listed'] = false;
            }
            unset($validated['account_approved']);
        }
        if (array_key_exists('account_declined', $validated)) {
            $validated['account_declined_at'] = $validated['account_declined'] ? now() : null;
            if ($validated['account_declined']) {
                $validated['account_approved_at'] = null;
                $validated['is_listed'] = false;
            }
            unset($validated['account_declined']);
        }
        $provider->update($validated);
        $provider->load('user');

        if (! $wasAccountApproved && filled($provider->account_approved_at) && $provider->user) {
            $provider->user->notify(new PlatformUpdateNotification(
                'Provider account approved',
                'Your provider account has been approved. You can now access your dashboard.',
                'Open dashboard',
                rtrim(config('app.frontend_url', config('app.url')), '/').'/provider',
                ['provider_id' => $provider->id],
            ));
        }
        if (! $wasAccountDeclined && blank($provider->account_approved_at) && filled($provider->account_declined_at) && $provider->user) {
            $provider->user->notify(new PlatformUpdateNotification(
                'Provider account review update',
                'Your provider account approval was declined. You can update your details and submit again.',
                'Update details',
                rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/onboarding',
                ['provider_id' => $provider->id, 'details' => ['Admin note' => $provider->account_review_notes]],
            ));
        }

        return $this->success($provider->fresh()->load(['user:id,name,email,is_active', 'category:id,name,slug']), 'Directory listing updated.');
    }

    public function providerCategories(): JsonResponse
    {
        return $this->success($this->categoryTotals());
    }

    public function storeProviderCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:provider_categories,name'],
            'description' => ['nullable', 'string', 'max:1000'],
            'cover_image' => ['nullable', 'url:http,https', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'between:0,999'],
        ]);

        $category = ProviderCategory::create([
            ...$validated,
            'slug' => Str::slug($validated['name']),
            'is_active' => $validated['is_active'] ?? true,
            'sort_order' => $validated['sort_order'] ?? 0,
        ]);

        return $this->success($category->loadCount('providers'), 'Provider category created.', 201);
    }

    public function updateProviderCategory(Request $request, ProviderCategory $category): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120', Rule::unique('provider_categories', 'name')->ignore($category)],
            'description' => ['nullable', 'string', 'max:1000'],
            'cover_image' => ['nullable', 'url:http,https', 'max:1000'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'between:0,999'],
        ]);

        if (isset($validated['name'])) {
            $validated['slug'] = Str::slug($validated['name']);
        }

        $category->update($validated);

        return $this->success($category->fresh()->loadCount('providers'), 'Provider category updated.');
    }

    public function destroyProviderCategory(ProviderCategory $category): JsonResponse
    {
        if ($category->providers()->exists()) {
            return response()->json(['message' => 'Move providers out of this category before deleting it.'], 422);
        }

        $category->delete();

        return $this->success(null, 'Provider category deleted.');
    }

    public function subscriptions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'plan' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'string', 'max:50'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:5,100'],
        ]);

        $query = Subscription::with(['user:id,name,email,role', 'planDefinition'])
            ->when($validated['plan'] ?? null, fn ($query, $plan) => $query->where('plan', $plan))
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($validated['search'] ?? null, fn ($query, $search) => $query->where(fn ($searchQuery) => $searchQuery
                ->where('plan', 'like', "%{$search}%")
                ->orWhere('status', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($userQuery) => $userQuery
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%"))));

        $statsQuery = clone $query;
        $subscriptions = $query->latest()->paginate($validated['per_page'] ?? 20);

        return $this->success($subscriptions->items(), meta: $this->paginationMeta($subscriptions) + [
            'stats' => [
                'active' => (clone $statsQuery)->where('status', 'active')->count(),
                'total' => (clone $statsQuery)->count(),
                'monthly_revenue' => (float) (clone $statsQuery)
                    ->where('status', 'active')
                    ->whereIn('plan', ['paid', 'pro'])
                    ->sum('amount'),
            ],
            'filters' => [
                'plans' => Subscription::query()
                    ->select('plan')
                    ->distinct()
                    ->orderBy('plan')
                    ->pluck('plan')
                    ->filter()
                    ->values(),
                'statuses' => Subscription::query()
                    ->select('status')
                    ->distinct()
                    ->orderBy('status')
                    ->pluck('status')
                    ->filter()
                    ->values(),
            ],
        ]);
    }

    private function activityFeed(int $limit = 50, string $type = 'all'): array
    {
        return $this->activityQuery($type)
            ->orderByDesc('created_at')
            ->orderByDesc('sort_id')
            ->limit($limit)
            ->get()
            ->map(fn ($item): array => (array) $item)
            ->all();

        $items = collect();
        $allow = fn (string $key): bool => $type === 'all' || $type === $key;

        if ($allow('users')) {
            User::latest()->limit($limit)->get(['id', 'name', 'email', 'role', 'created_at'])->each(fn ($user) => $items->push([
                'id' => 'user-'.$user->id,
                'type' => 'users',
                'title' => 'New '.$user->role.' account',
                'description' => "{$user->name} ({$user->email}) joined BeautyPro HQ.",
                'created_at' => $user->created_at,
            ]));
        }

        if ($allow('bookings')) {
            Booking::with(['customer:id,name', 'provider.user:id,name', 'service:id,name'])->latest()->limit($limit)->get()->each(fn ($booking) => $items->push([
                'id' => 'booking-'.$booking->id,
                'type' => 'bookings',
                'title' => 'Booking '.$booking->status,
                'description' => ($booking->customer?->name ?? 'Customer').' booked '.($booking->service?->name ?? 'a service').' with '.($booking->provider?->user?->name ?? 'a provider').'.',
                'created_at' => $booking->created_at,
            ]));
        }

        if ($allow('payments')) {
            Payment::latest()->limit($limit)->get()->each(fn ($payment) => $items->push([
                'id' => 'payment-'.$payment->id,
                'type' => 'payments',
                'title' => 'Payment '.$payment->status,
                'description' => $payment->currency.' '.number_format((float) $payment->amount).' via '.($payment->gateway ?? 'pending gateway').'.',
                'created_at' => $payment->created_at,
            ]));
        }

        if ($allow('subscriptions')) {
            Subscription::with('user:id,name,email')->latest()->limit($limit)->get()->each(fn ($subscription) => $items->push([
                'id' => 'subscription-'.$subscription->id,
                'type' => 'subscriptions',
                'title' => ucfirst($subscription->plan).' plan '.$subscription->status,
                'description' => ($subscription->user?->name ?? 'A member').' is on the '.$subscription->plan.' plan.',
                'created_at' => $subscription->created_at,
            ]));
        }

        if ($allow('listings')) {
            ProviderProfile::with('user:id,name')->latest()->limit($limit)->get()->each(fn ($provider) => $items->push([
                'id' => 'listing-'.$provider->id,
                'type' => 'listings',
                'title' => $provider->is_listed ? 'Provider listing active' : 'Provider listing hidden',
                'description' => ($provider->user?->name ?? 'Provider').' listing: '.$provider->profession,
                'created_at' => $provider->updated_at,
            ]));
        }

        if ($allow('content')) {
            News::latest()->limit($limit)->get(['id', 'title', 'published_at', 'created_at'])->each(fn ($news) => $items->push([
                'id' => 'news-'.$news->id,
                'type' => 'content',
                'title' => 'News '.($news->published_at ? 'published' : 'draft'),
                'description' => $news->title,
                'created_at' => $news->created_at,
            ]));
            Event::latest()->limit($limit)->get(['id', 'title', 'published_at', 'created_at'])->each(fn ($event) => $items->push([
                'id' => 'event-'.$event->id,
                'type' => 'content',
                'title' => 'Event '.($event->published_at ? 'published' : 'draft'),
                'description' => $event->title,
                'created_at' => $event->created_at,
            ]));
        }

        if ($allow('announcements')) {
            Announcement::latest()->limit($limit)->get()->each(fn ($announcement) => $items->push([
                'id' => 'announcement-'.$announcement->id,
                'type' => 'announcements',
                'title' => 'Announcement sent',
                'description' => $announcement->title.' · '.$announcement->audience,
                'created_at' => $announcement->created_at,
            ]));
        }

        return $items->sortByDesc('created_at')->take($limit)->values()->all();
    }

    private function activityQuery(string $type = 'all')
    {
        $queries = [];
        $allow = fn (string $key): bool => $type === 'all' || $type === $key;

        if ($allow('users')) {
            $queries[] = DB::table('users')
                ->selectRaw($this->sqlConcat(["'user-'", 'users.id']).' as id')
                ->selectRaw("'users' as type")
                ->selectRaw('users.id as record_id')
                ->selectRaw($this->sqlConcat(["'New '", 'users.role', "' account'"]).' as title')
                ->selectRaw($this->sqlConcat(['users.name', "' ('", 'users.email', "') joined BeautyPro HQ.'"]).' as description')
                ->selectRaw('users.name as actor')
                ->selectRaw('users.email as actor_email')
                ->selectRaw('users.role as status')
                ->selectRaw('null as amount')
                ->selectRaw('null as currency')
                ->selectRaw('users.created_at as created_at')
                ->selectRaw('users.id as sort_id');
        }

        if ($allow('bookings')) {
            $queries[] = DB::table('bookings')
                ->leftJoin('users as customers', 'customers.id', '=', 'bookings.customer_id')
                ->leftJoin('provider_profiles', 'provider_profiles.id', '=', 'bookings.provider_id')
                ->leftJoin('users as providers', 'providers.id', '=', 'provider_profiles.user_id')
                ->leftJoin('services', 'services.id', '=', 'bookings.service_id')
                ->selectRaw($this->sqlConcat(["'booking-'", 'bookings.id']).' as id')
                ->selectRaw("'bookings' as type")
                ->selectRaw('bookings.id as record_id')
                ->selectRaw($this->sqlConcat(["'Booking '", 'bookings.status']).' as title')
                ->selectRaw($this->sqlConcat(["coalesce(customers.name, 'Customer')", "' booked '", "coalesce(services.name, 'a service')", "' with '", "coalesce(providers.name, 'a provider')", "'.'"]).' as description')
                ->selectRaw('customers.name as actor')
                ->selectRaw('customers.email as actor_email')
                ->selectRaw('bookings.status as status')
                ->selectRaw('null as amount')
                ->selectRaw('null as currency')
                ->selectRaw('bookings.created_at as created_at')
                ->selectRaw('bookings.id as sort_id');
        }

        if ($allow('payments')) {
            $queries[] = DB::table('payments')
                ->leftJoin('provider_profiles', 'provider_profiles.id', '=', 'payments.provider_id')
                ->leftJoin('users as providers', 'providers.id', '=', 'provider_profiles.user_id')
                ->selectRaw($this->sqlConcat(["'payment-'", 'payments.id']).' as id')
                ->selectRaw("'payments' as type")
                ->selectRaw('payments.id as record_id')
                ->selectRaw($this->sqlConcat(["'Payment '", 'payments.status']).' as title')
                ->selectRaw($this->sqlConcat(['payments.currency', "' '", 'cast(payments.amount as char)', "' via '", "coalesce(payments.gateway, 'pending gateway')", "'.'"]).' as description')
                ->selectRaw('providers.name as actor')
                ->selectRaw('providers.email as actor_email')
                ->selectRaw('payments.status as status')
                ->selectRaw('payments.amount as amount')
                ->selectRaw('payments.currency as currency')
                ->selectRaw('payments.created_at as created_at')
                ->selectRaw('payments.id as sort_id');
        }

        if ($allow('subscriptions')) {
            $queries[] = DB::table('subscriptions')
                ->leftJoin('users', 'users.id', '=', 'subscriptions.user_id')
                ->selectRaw($this->sqlConcat(["'subscription-'", 'subscriptions.id']).' as id')
                ->selectRaw("'subscriptions' as type")
                ->selectRaw('subscriptions.id as record_id')
                ->selectRaw($this->sqlConcat(['subscriptions.plan', "' plan '", 'subscriptions.status']).' as title')
                ->selectRaw($this->sqlConcat(["coalesce(users.name, 'A member')", "' is on the '", 'subscriptions.plan', "' plan.'"]).' as description')
                ->selectRaw('users.name as actor')
                ->selectRaw('users.email as actor_email')
                ->selectRaw('subscriptions.status as status')
                ->selectRaw('subscriptions.amount as amount')
                ->selectRaw('subscriptions.currency as currency')
                ->selectRaw('subscriptions.created_at as created_at')
                ->selectRaw('subscriptions.id as sort_id');
        }

        if ($allow('listings')) {
            $queries[] = DB::table('provider_profiles')
                ->leftJoin('users', 'users.id', '=', 'provider_profiles.user_id')
                ->selectRaw($this->sqlConcat(["'listing-'", 'provider_profiles.id']).' as id')
                ->selectRaw("'listings' as type")
                ->selectRaw('provider_profiles.id as record_id')
                ->selectRaw("case when provider_profiles.is_listed = 1 then 'Provider listing active' else 'Provider listing hidden' end as title")
                ->selectRaw($this->sqlConcat(["coalesce(users.name, 'Provider')", "' listing: '", "coalesce(provider_profiles.profession, 'Beauty Professional')"]).' as description')
                ->selectRaw('users.name as actor')
                ->selectRaw('users.email as actor_email')
                ->selectRaw("case when provider_profiles.is_listed = 1 then 'active' else 'hidden' end as status")
                ->selectRaw('null as amount')
                ->selectRaw('provider_profiles.default_currency as currency')
                ->selectRaw('provider_profiles.updated_at as created_at')
                ->selectRaw('provider_profiles.id as sort_id');
        }

        if ($allow('content')) {
            $queries[] = DB::table('news')
                ->selectRaw($this->sqlConcat(["'news-'", 'news.id']).' as id')
                ->selectRaw("'content' as type")
                ->selectRaw('news.id as record_id')
                ->selectRaw("case when news.published_at is null then 'News draft' else 'News published' end as title")
                ->selectRaw('news.title as description')
                ->selectRaw("'News' as actor")
                ->selectRaw('null as actor_email')
                ->selectRaw("case when news.published_at is null then 'draft' else 'published' end as status")
                ->selectRaw('null as amount')
                ->selectRaw('null as currency')
                ->selectRaw('news.created_at as created_at')
                ->selectRaw('news.id as sort_id');

            $queries[] = DB::table('events')
                ->selectRaw($this->sqlConcat(["'event-'", 'events.id']).' as id')
                ->selectRaw("'content' as type")
                ->selectRaw('events.id as record_id')
                ->selectRaw("case when events.published_at is null then 'Event draft' else 'Event published' end as title")
                ->selectRaw('events.title as description')
                ->selectRaw("'Event' as actor")
                ->selectRaw('null as actor_email')
                ->selectRaw("case when events.published_at is null then 'draft' else 'published' end as status")
                ->selectRaw('null as amount')
                ->selectRaw('null as currency')
                ->selectRaw('events.created_at as created_at')
                ->selectRaw('events.id as sort_id');
        }

        if ($allow('announcements')) {
            $queries[] = DB::table('announcements')
                ->selectRaw($this->sqlConcat(["'announcement-'", 'announcements.id']).' as id')
                ->selectRaw("'announcements' as type")
                ->selectRaw('announcements.id as record_id')
                ->selectRaw("'Announcement sent' as title")
                ->selectRaw($this->sqlConcat(['announcements.title', "' - '", 'announcements.audience']).' as description')
                ->selectRaw('announcements.audience as actor')
                ->selectRaw('null as actor_email')
                ->selectRaw('announcements.audience as status')
                ->selectRaw('null as amount')
                ->selectRaw('null as currency')
                ->selectRaw('announcements.created_at as created_at')
                ->selectRaw('announcements.id as sort_id');
        }

        return collect($queries)->skip(1)->reduce(
            fn ($union, $query) => $union->unionAll($query),
            $queries[0]
        );
    }

    private function sqlConcat(array $parts): string
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return implode(' || ', $parts);
        }

        return 'concat('.implode(', ', $parts).')';
    }

    private function activityStatuses(): array
    {
        return [
            'active',
            'admin',
            'all',
            'cancelled',
            'confirmed',
            'customer',
            'draft',
            'expired',
            'failed',
            'hidden',
            'paid',
            'pending',
            'processing',
            'provider',
            'published',
            'refunded',
        ];
    }

    private function categoryTotals()
    {
        return ProviderCategory::withCount('providers')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }
}
