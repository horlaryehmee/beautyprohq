<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Availability;
use App\Models\Booking;
use App\Models\CommunityPost;
use App\Models\CrmCustomer;
use App\Models\DigitalProduct;
use App\Models\EventRegistration;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PortfolioItem;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\Reward;
use App\Models\SavedProvider;
use App\Models\Service;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\Announcement;
use App\Models\Event;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Notifications\PlatformUpdateNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
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
            'per_page' => ['nullable', 'integer', 'between:5,100'],
            'page' => ['nullable', 'integer', 'min:1'],
        ]);

        $perPage = $validated['per_page'] ?? 20;
        $page = $validated['page'] ?? 1;
        $items = collect($this->activityFeed(500, $validated['type'] ?? 'all'));
        $paginator = new LengthAwarePaginator(
            $items->forPage($page, $perPage)->values(),
            $items->count(),
            $perPage,
            $page
        );

        return $this->success($paginator->items(), meta: $this->paginationMeta($paginator));
    }

    public function waitlist(Request $request): JsonResponse
    {
        $subscribers = NewsletterSubscriber::query()
            ->when($request->search, fn ($query, $search) => $query->where(fn ($nested) => $nested
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")))
            ->latest('subscribed_at')
            ->paginate($this->perPage($request, 20, 100));

        return $this->success([
            'subscribers' => $subscribers->items(),
            'stats' => [
                'total' => NewsletterSubscriber::count(),
                'active' => NewsletterSubscriber::whereNull('unsubscribed_at')->count(),
                'unsubscribed' => NewsletterSubscriber::whereNotNull('unsubscribed_at')->count(),
                'today' => NewsletterSubscriber::whereDate('subscribed_at', today())->count(),
            ],
            'pagination' => $this->paginationMeta($subscribers),
        ], meta: $this->paginationMeta($subscribers));
    }

    public function updateSubscriber(Request $request, NewsletterSubscriber $subscriber): JsonResponse
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'email' => ['required', 'email:rfc', 'max:255', Rule::unique('newsletter_subscribers', 'email')->ignore($subscriber->id)],
            'status' => ['required', Rule::in(['active', 'unsubscribed'])],
        ]);

        $subscriber->forceFill([
            'name' => $data['name'] ?? null,
            'email' => Str::lower(trim($data['email'])),
            'subscribed_at' => $subscriber->subscribed_at ?: now(),
            'unsubscribed_at' => $data['status'] === 'unsubscribed' ? ($subscriber->unsubscribed_at ?: now()) : null,
        ])->save();

        return $this->success($subscriber->fresh(), 'Subscriber updated.');
    }

    public function exportWaitlist(Request $request)
    {
        $filename = 'beautyprohq-waitlist-'.now()->format('Y-m-d-His').'.csv';
        $subscribers = NewsletterSubscriber::query()
            ->when($request->search, fn ($query, $search) => $query->where(fn ($nested) => $nested
                ->where('name', 'like', "%{$search}%")
                ->orWhere('email', 'like', "%{$search}%")))
            ->latest('subscribed_at')
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
        $users = User::with('providerProfile')
            ->when($request->role, fn ($q, $role) => $q->where('role', $role))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->search, fn ($q, $search) => $q->where(fn ($x) => $x->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->latest()->paginate($this->perPage($request, 20, 100));

        return $this->success($users->items(), meta: $this->paginationMeta($users));
    }

    public function showUser(User $user): JsonResponse
    {
        $user->load([
            'providerProfile.category',
            'providerProfile.services',
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
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user)],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'role' => ['sometimes', Rule::in(['provider', 'customer', 'admin'])],
            'is_active' => ['sometimes', 'boolean'],
            'email_verified' => ['sometimes', 'boolean'],
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
            $userData = collect($validated)->only(['name', 'email', 'phone', 'role', 'is_active'])->all();
            if (array_key_exists('email_verified', $validated)) {
                $userData['email_verified_at'] = $validated['email_verified'] ? ($user->email_verified_at ?? now()) : null;
            }

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

    public function destroyUser(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'confirmation' => ['required', 'string', Rule::in(['DELETE'])],
        ]);

        if ($user->is($request->user())) {
            return response()->json(['message' => 'You cannot delete your own admin account.'], 422);
        }

        DB::transaction(function () use ($user): void {
            $user->tokens()->delete();
            $profile = $user->providerProfile()->first();
            $providerIds = $profile ? collect([$profile->id]) : collect();
            $userIds = collect([$user->id]);
            $bookingIds = Booking::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->pluck('id');
            $loyaltyIds = Loyalty::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->pluck('id');

            EventRegistration::whereIn('user_id', $userIds)->delete();
            SubscriptionPayment::whereIn('user_id', $userIds)->delete();
            Subscription::whereIn('user_id', $userIds)->delete();
            Payment::whereIn('booking_id', $bookingIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            LoyaltyTransaction::whereIn('loyalty_id', $loyaltyIds)->orWhereIn('booking_id', $bookingIds)->delete();
            Loyalty::whereIn('id', $loyaltyIds)->delete();
            CrmCustomer::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            SavedProvider::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            Review::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            Booking::whereIn('id', $bookingIds)->delete();

            if ($providerIds->isNotEmpty()) {
                PaymentAccount::whereIn('provider_id', $providerIds)->delete();
                DigitalProduct::whereIn('provider_id', $providerIds)->delete();
                Reward::whereIn('provider_id', $providerIds)->delete();
                VerificationRequest::whereIn('provider_id', $providerIds)->delete();
                PortfolioItem::whereIn('provider_id', $providerIds)->delete();
                Availability::whereIn('provider_id', $providerIds)->delete();
                Service::whereIn('provider_id', $providerIds)->delete();
                CommunityPost::whereIn('provider_id', $providerIds)->update(['provider_id' => null]);
                ProviderProfile::whereIn('id', $providerIds)->delete();
                Cache::forget('public.home.payload.v5');
            }

            $user->delete();
        });

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
        $providers = ProviderProfile::with(['user:id,name,email,is_active', 'category:id,name,slug', 'services'])
            ->when($request->filled('verified'), fn ($q) => $q->where('verified', $request->boolean('verified')))
            ->when($request->account_approval === 'pending', fn ($q) => $q
                ->whereNotNull('onboarding_completed_at')
                ->whereNull('account_approved_at')
                ->whereNull('account_declined_at'))
            ->when($request->account_approval === 'approved', fn ($q) => $q->whereNotNull('account_approved_at'))
            ->when($request->account_approval === 'declined', fn ($q) => $q->whereNotNull('account_declined_at')->whereNull('account_approved_at'))
            ->when($request->filled('is_listed'), fn ($q) => $q->where('is_listed', $request->boolean('is_listed')))
            ->when($request->filled('category_id'), fn ($q) => $q->where('provider_category_id', $request->integer('category_id')))
            ->when($request->search, fn ($q, $search) => $q->where(fn ($x) => $x
                ->where('profession', 'like', "%{$search}%")
                ->orWhere('location', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))
            ))
            ->latest()->paginate($this->perPage($request, 20, 100));

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

    private function categoryTotals()
    {
        return ProviderCategory::withCount('providers')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }
}
