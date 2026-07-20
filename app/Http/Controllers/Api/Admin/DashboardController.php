<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\News;
use App\Models\Payment;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\Announcement;
use App\Models\Event;
use App\Models\User;
use App\Models\VerificationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
        ]);

        return $this->success($this->activityFeed($validated['per_page'] ?? 50, $validated['type'] ?? 'all'));
    }

    public function users(Request $request): JsonResponse
    {
        $users = User::with('providerProfile')
            ->when($request->role, fn ($q, $role) => $q->where('role', $role))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->search, fn ($q, $search) => $q->where(fn ($x) => $x->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%")))
            ->latest()->paginate($request->integer('per_page', 20));

        return $this->success($users->items(), meta: $this->paginationMeta($users));
    }

    public function showUser(User $user): JsonResponse
    {
        return $this->success($user->load([
            'providerProfile.category',
            'providerProfile.services',
            'providerProfile.verificationRequests' => fn ($query) => $query->latest(),
            'customerBookings.service:id,name',
            'customerBookings.provider.user:id,name',
        ]));
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user)],
            'role' => ['sometimes', Rule::in(['provider', 'customer', 'admin'])],
            'is_active' => ['sometimes', 'boolean'],
            'email_verified' => ['sometimes', 'boolean'],
            'provider_profile' => ['sometimes', 'array'],
            'provider_profile.provider_category_id' => ['nullable', 'integer', 'exists:provider_categories,id'],
            'provider_profile.profession' => ['nullable', 'string', 'max:120'],
            'provider_profile.bio' => ['nullable', 'string', 'max:5000'],
            'provider_profile.location' => ['nullable', 'string', 'max:180'],
            'provider_profile.profile_photo' => ['nullable', 'string', 'max:500'],
            'provider_profile.verified' => ['sometimes', 'boolean'],
            'provider_profile.is_listed' => ['sometimes', 'boolean'],
            'provider_profile.is_pro_of_week' => ['sometimes', 'boolean'],
            'provider_profile.social_links' => ['nullable', 'array'],
            'provider_profile.portfolio_links' => ['nullable', 'array'],
            'provider_profile.digital_product_links' => ['nullable', 'array'],
            'verification_status' => ['sometimes', Rule::in(['approved', 'rejected', 'pending'])],
            'verification_notes' => ['nullable', 'string', 'max:5000'],
        ]);

        DB::transaction(function () use ($request, $user, $validated): void {
            $userData = collect($validated)->only(['name', 'email', 'role', 'is_active'])->all();
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
                $user->providerProfile->update($validated['provider_profile']);
            }

            if (isset($validated['verification_status']) && $user->providerProfile) {
                $status = $validated['verification_status'];
                $user->providerProfile->update(['verified' => $status === 'approved']);
                $requestModel = $user->providerProfile->verificationRequests()->latest()->first()
                    ?? $user->providerProfile->verificationRequests()->make([
                        'portfolio_links' => $user->providerProfile->portfolio_links ?? [],
                        'certification_files' => [],
                        'license_files' => [],
                        'social_links' => $user->providerProfile->social_links ?? [],
                        'professional_info' => collect([$user->providerProfile->profession, $user->providerProfile->location, $user->providerProfile->bio])->filter()->implode("\n\n"),
                    ]);
                $requestModel->fill([
                    'status' => $status,
                    'admin_notes' => $validated['verification_notes'] ?? $requestModel->admin_notes,
                    'reviewed_by' => $request->user()->id,
                    'reviewed_at' => now(),
                ])->save();
            }

            if (isset($validated['is_active']) && ! $validated['is_active']) {
                $user->tokens()->delete();
            }
        });

        return $this->success($user->fresh()->load(['providerProfile.category', 'providerProfile.verificationRequests' => fn ($query) => $query->latest()]), 'User updated.');
    }

    public function directory(Request $request): JsonResponse
    {
        $providers = ProviderProfile::with(['user:id,name,email,is_active', 'category:id,name,slug', 'services'])
            ->when($request->filled('verified'), fn ($q) => $q->where('verified', $request->boolean('verified')))
            ->when($request->filled('is_listed'), fn ($q) => $q->where('is_listed', $request->boolean('is_listed')))
            ->when($request->filled('category_id'), fn ($q) => $q->where('provider_category_id', $request->integer('category_id')))
            ->when($request->search, fn ($q, $search) => $q->where(fn ($x) => $x
                ->where('profession', 'like', "%{$search}%")
                ->orWhere('location', 'like', "%{$search}%")
                ->orWhereHas('user', fn ($u) => $u->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"))
            ))
            ->latest()->paginate($request->integer('per_page', 20));

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
        $provider->update($validated);

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
        $subscriptions = Subscription::with(['user:id,name,email,role', 'planDefinition'])->latest()->paginate($request->integer('per_page', 20));

        return $this->success($subscriptions->items(), meta: $this->paginationMeta($subscriptions));
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
            News::latest()->limit($limit)->get(['id', 'title', 'status', 'created_at'])->each(fn ($news) => $items->push([
                'id' => 'news-'.$news->id,
                'type' => 'content',
                'title' => 'News '.$news->status,
                'description' => $news->title,
                'created_at' => $news->created_at,
            ]));
            Event::latest()->limit($limit)->get(['id', 'title', 'status', 'created_at'])->each(fn ($event) => $items->push([
                'id' => 'event-'.$event->id,
                'type' => 'content',
                'title' => 'Event '.$event->status,
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
