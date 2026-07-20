<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Payment;
use App\Models\ProfileView;
use App\Models\VerificationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        $subscription = $request->user()->activeSubscription()->with('planDefinition')->first();
        $isPaid = $request->user()->hasPaidPlan();
        $base = Booking::where('provider_id', $provider->id);
        $from = now()->subDays(29)->startOfDay();
        $views = ProfileView::where('provider_id', $provider->id)
            ->where('viewed_on', '>=', $from)
            ->select('viewed_on', DB::raw('count(*) as total'))
            ->groupBy('viewed_on')
            ->orderBy('viewed_on')
            ->get();
        $monthBookings = (clone $base)->where('created_at', '>=', $from);
        $viewCount = (int) $views->sum('total');
        $bookingCount = (clone $monthBookings)->count();
        $paidPayments = Payment::where('provider_id', $provider->id)->where('status', 'paid');
        $locationParts = collect(explode(',', (string) $provider->location))
            ->map(fn ($part) => trim($part))
            ->filter()
            ->values();
        $marketLocation = [
            'location' => $provider->location ?: 'Not set',
            'city' => $locationParts->first() ?: 'Not set',
            'country' => $locationParts->count() > 1 ? $locationParts->last() : 'Not set',
        ];

        return $this->success([
            'stats' => [
                'total_bookings' => (clone $base)->count(),
                'upcoming_bookings' => (clone $base)->upcoming()->count(),
                'pending_bookings' => (clone $base)->where('status', 'pending')->count(),
                'completed_bookings' => (clone $base)->where('status', 'completed')->count(),
                'cancelled_bookings' => (clone $base)->whereIn('status', ['cancelled', 'rejected'])->count(),
                'total_revenue' => (clone $paidPayments)->sum('amount'),
                'monthly_revenue' => (clone $paidPayments)->where('paid_at', '>=', $from)->sum('amount'),
                'profile_views' => $provider->profile_views,
                'monthly_profile_views' => $viewCount,
                'conversion_rate' => $viewCount > 0 ? round($bookingCount / $viewCount * 100, 1) : 0,
                'rating' => $provider->rating,
                'review_count' => $provider->review_count,
                'customer_count' => (clone $base)->distinct('customer_id')->count('customer_id'),
                'service_count' => $provider->services()->count(),
            ],
            'upcoming_bookings' => (clone $base)->upcoming()->with(['customer:id,name', 'service'])->orderBy('date')->orderBy('time')->limit(8)->get(),
            'notifications' => $request->user()->unreadNotifications()->latest()->limit(8)->get(),
            'profile_completion' => $this->completion($provider),
            'verification_status' => $provider->verified ? 'approved' : ($provider->verificationRequests()->latest()->value('status') ?? 'not_submitted'),
            'subscription' => $subscription,
            'is_paid_plan' => $isPaid,
            'analytics' => [
                'profile_views' => $views,
                'status_breakdown' => Booking::where('provider_id', $provider->id)->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status'),
                'service_popularity' => Booking::where('provider_id', $provider->id)->select('service_id', DB::raw('count(*) as bookings_count'))->with('service:id,name')->groupBy('service_id')->orderByDesc('bookings_count')->limit(6)->get(),
                'market_location' => $marketLocation,
                'payment_status' => Payment::where('provider_id', $provider->id)->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status'),
            ],
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        return $this->success($request->user()->providerProfile->load(['user:id,name,email,phone', 'category', 'services', 'portfolioItems', 'digitalProducts', 'availability' => fn ($query) => $query->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time')]));
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $photoRules = $request->hasFile('profile_photo')
            ? ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120']
            : ['url:http,https', 'max:1000'];
        $coverRules = $request->hasFile('cover_image')
            ? ['image', 'mimes:jpg,jpeg,png,webp', 'max:8192']
            : ['url:http,https', 'max:1000'];
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'provider_category_id' => ['sometimes', 'nullable', 'integer', 'exists:provider_categories,id'],
            'profession' => ['sometimes', 'nullable', 'string', 'max:120'],
            'bio' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'location' => ['sometimes', 'nullable', 'string', 'max:180'],
            'country' => ['sometimes', 'nullable', 'string', 'max:100'],
            'city' => ['sometimes', 'nullable', 'string', 'max:100'],
            'contact_email' => ['sometimes', 'nullable', 'email', 'max:255'],
            'contact_phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'website' => ['sometimes', 'nullable', 'url:http,https', 'max:500'],
            'base_price' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999'],
            'default_currency' => ['sometimes', Rule::in(array_keys(config('currencies.supported', [])))],
            'profile_photo' => ['sometimes', 'nullable', ...$photoRules],
            'cover_image' => ['sometimes', 'nullable', ...$coverRules],
            'social_links' => ['sometimes', 'nullable', 'array'],
            'social_links.*' => ['nullable', 'url', 'max:500'],
            'portfolio_links' => ['sometimes', 'nullable', 'array'],
            'portfolio_links.*' => ['url', 'max:500'],
            'digital_product_links' => ['sometimes', 'nullable', 'array'],
            'digital_product_links.*' => ['url', 'max:500'],
            'availability' => ['sometimes', 'array'],
            'availability.*.day_of_week' => ['required_with:availability', 'integer', 'between:0,6'],
            'availability.*.start_time' => ['required_with:availability', 'date_format:H:i'],
            'availability.*.end_time' => ['required_with:availability', 'date_format:H:i', 'after:start_time'],
        ]);

        $provider = $request->user()->providerProfile;
        if (array_key_exists('name', $validated)) {
            $request->user()->update([
                'name' => $validated['name'],
                'phone' => $validated['contact_phone'] ?? $request->user()->phone,
            ]);
            unset($validated['name']);
        } elseif (array_key_exists('contact_phone', $validated)) {
            $request->user()->update(['phone' => $validated['contact_phone']]);
        }
        if ($request->hasFile('profile_photo')) {
            $validated['profile_photo'] = $request->file('profile_photo')->store('providers', 'public');
        } elseif (isset($validated['profile_photo']) && ! is_string($validated['profile_photo'])) {
            unset($validated['profile_photo']);
        }
        if ($request->hasFile('cover_image')) {
            $validated['cover_image'] = $request->file('cover_image')->store('providers/covers', 'public');
        } elseif (isset($validated['cover_image']) && ! is_string($validated['cover_image'])) {
            unset($validated['cover_image']);
        }

        $availability = $validated['availability'] ?? null;
        unset($validated['availability']);

        DB::transaction(function () use ($provider, $validated, $availability): void {
            $provider->update($validated);

            if (is_array($availability)) {
                $provider->availability()->delete();
                foreach ($availability as $slot) {
                    $provider->availability()->create($slot + ['is_active' => true]);
                }
            }
        });

        return $this->success($provider->fresh()->load(['user:id,name,email,phone', 'category', 'services', 'portfolioItems', 'digitalProducts', 'availability' => fn ($query) => $query->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time')]), 'Profile updated.');
    }

    public function completeOnboarding(Request $request): JsonResponse
    {
        foreach (['social_links', 'availability'] as $jsonField) {
            if (is_string($request->input($jsonField))) {
                $request->merge([$jsonField => json_decode($request->input($jsonField), true) ?: []]);
            }
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'provider_category_id' => ['required', 'integer', 'exists:provider_categories,id'],
            'profession' => ['required', 'string', 'max:120'],
            'bio' => ['required', 'string', 'min:20', 'max:5000'],
            'profile_photo' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'cover_image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
            'contact_email' => ['required', 'email', 'max:255'],
            'contact_phone' => ['required', 'string', 'max:40'],
            'website' => ['nullable', 'url:http,https', 'max:500'],
            'social_links' => ['nullable', 'array'],
            'social_links.*.platform' => ['required_with:social_links', 'string', 'max:40'],
            'social_links.*.url' => ['required_with:social_links', 'url:http,https', 'max:500'],
            'location' => ['required', 'string', 'max:180'],
            'country' => ['required', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'default_currency' => ['required', Rule::in(array_keys(config('currencies.supported', [])))],
            'base_price' => ['required', 'numeric', 'min:0', 'max:999999999'],
            'availability' => ['required', 'array', 'min:1'],
            'availability.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'availability.*.start_time' => ['required', 'date_format:H:i'],
            'availability.*.end_time' => ['required', 'date_format:H:i', 'after:start_time'],
            'terms_accepted' => ['accepted'],
        ]);

        $provider = $request->user()->providerProfile;

        DB::transaction(function () use ($request, $provider, $validated): void {
            $request->user()->update([
                'name' => $validated['name'],
                'phone' => $validated['contact_phone'] ?? $request->user()->phone,
            ]);

            $socialLinks = collect($validated['social_links'] ?? [])
                ->filter(fn ($item) => filled($item['platform'] ?? null) && filled($item['url'] ?? null))
                ->mapWithKeys(fn ($item) => [strtolower($item['platform']) => $item['url']])
                ->all();

            $provider->update([
                'provider_category_id' => $validated['provider_category_id'],
                'profession' => $validated['profession'],
                'bio' => $validated['bio'],
                'profile_photo' => $request->file('profile_photo')->store('providers', 'public'),
                'cover_image' => $request->file('cover_image')->store('providers/covers', 'public'),
                'contact_email' => $validated['contact_email'],
                'contact_phone' => $validated['contact_phone'] ?? null,
                'website' => $validated['website'] ?? null,
                'social_links' => $socialLinks,
                'location' => $validated['location'],
                'country' => $validated['country'],
                'city' => $validated['city'],
                'default_currency' => $validated['default_currency'],
                'base_price' => $validated['base_price'],
                'terms_accepted_at' => now(),
                'onboarding_completed_at' => now(),
            ]);

            $provider->availability()->delete();
            foreach ($validated['availability'] as $slot) {
                $provider->availability()->create($slot + ['is_active' => true]);
            }
        });

        return $this->success($provider->fresh()->load(['user:id,name,email,phone', 'category', 'availability']), 'Listing details completed.');
    }

    public function analytics(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        $from = now()->subDays(29)->startOfDay();
        $views = ProfileView::where('provider_id', $provider->id)->where('viewed_on', '>=', $from)->select('viewed_on', DB::raw('count(*) as total'))->groupBy('viewed_on')->orderBy('viewed_on')->get();
        $bookings = Booking::where('provider_id', $provider->id)->where('created_at', '>=', $from);
        $viewCount = $views->sum('total');

        return $this->success([
            'profile_views' => $views,
            'booking_count' => (clone $bookings)->count(),
            'conversion_rate' => $viewCount > 0 ? round((clone $bookings)->count() / $viewCount * 100, 1) : 0,
            'service_popularity' => Booking::where('provider_id', $provider->id)->select('service_id', DB::raw('count(*) as bookings_count'))->with('service:id,name')->groupBy('service_id')->orderByDesc('bookings_count')->get(),
            'status_breakdown' => Booking::where('provider_id', $provider->id)->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status'),
        ]);
    }

    public function verification(Request $request): JsonResponse
    {
        return $this->success([
            'verified' => $request->user()->providerProfile->verified,
            'request' => $request->user()->providerProfile->verificationRequests()->latest()->first(),
        ]);
    }

    public function submitVerification(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_if($provider->verified, 422, 'This provider is already verified.');
        abort_if($provider->verificationRequests()->where('status', 'pending')->exists(), 422, 'A verification request is already under review.');

        $validated = $request->validate([
            'portfolio_links' => ['required', 'array', 'min:1'],
            'portfolio_links.*' => ['required', 'url', 'max:500'],
            'social_links' => ['nullable', 'array'],
            'social_links.*' => ['nullable', 'url', 'max:500'],
            'professional_info' => ['required', 'string', 'max:5000'],
            'certification_files' => ['nullable', 'array'],
            'certification_files.*' => ['required', 'url:http,https', 'max:1000'],
            'license_files' => ['nullable', 'array'],
            'license_files.*' => ['required', 'url:http,https', 'max:1000'],
        ]);

        $verification = VerificationRequest::create([
            'provider_id' => $provider->id,
            'portfolio_links' => $validated['portfolio_links'],
            'social_links' => array_filter($validated['social_links'] ?? $provider->social_links ?? []),
            'professional_info' => $validated['professional_info'],
            'certification_files' => array_values($validated['certification_files'] ?? []),
            'license_files' => array_values($validated['license_files'] ?? []),
        ]);

        return $this->success($verification, 'Verification request submitted.', 201);
    }

    private function completion($provider): int
    {
        $checks = [$provider->profession, $provider->bio, $provider->location, $provider->profile_photo, $provider->services()->exists()];

        return (int) round(collect($checks)->filter()->count() / count($checks) * 100);
    }
}
