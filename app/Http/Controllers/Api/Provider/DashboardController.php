<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\Payment;
use App\Models\PortfolioItem;
use App\Models\ProfileView;
use App\Models\Subscription;
use App\Models\UploadedMedia;
use App\Models\VerificationRequest;
use App\Models\User;
use App\Notifications\PlatformUpdateNotification;
use App\Services\UploadService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->restorePrematurelyCancelledPaidAccess();
        $provider = $user->providerProfile;
        $subscription = $user->activeSubscription()->with('planDefinition')->first();
        $isPaid = $user->hasPaidPlan();
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
        $retention = $this->customerRetention($provider->id, $from);
        $paidPayments = Payment::where('provider_id', $provider->id)->where('status', 'paid');
        $locationParts = collect(explode(',', (string) $provider->location))
            ->map(fn ($part) => trim($part))
            ->filter()
            ->values();
        $marketLocation = [
            'location' => $provider->location ?: 'Not set',
            'city' => $provider->city ?: ($locationParts->first() ?: 'Not set'),
            'country' => $provider->country ?: ($locationParts->count() > 1 ? $locationParts->last() : 'Not set'),
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
                'customer_retention_rate' => $retention['rate'],
                'returning_customers' => $retention['returning_customers'],
                'period_customers' => $retention['period_customers'],
                'rating' => $provider->rating,
                'review_count' => $provider->review_count,
                'customer_count' => (clone $base)->distinct('customer_id')->count('customer_id'),
                'service_count' => $provider->services()->count(),
            ],
            'upcoming_bookings' => (clone $base)->upcoming()->with(['customer:id,name', 'service'])->orderBy('date')->orderBy('time')->limit(8)->get(),
            'notifications' => $user->unreadNotifications()->latest()->limit(8)->get(),
            'profile_completion' => $this->completion($provider),
            'verification_status' => $provider->verified ? 'approved' : ($provider->verificationRequests()->latest()->value('status') ?? 'not_submitted'),
            'pending_paid_plan_selection' => $this->hasPendingPaidPlanSelection($user),
            'payment_required' => $this->hasPendingPaidPlanSelection($user) && ! $isPaid,
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
        return $this->success($request->user()->providerProfile->load(['user:id,name,email,phone', 'user.activeSubscription.planDefinition', 'category', 'services', 'portfolioItems', 'digitalProducts', 'availability' => fn ($query) => $query->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time')]));
    }

    public function updateProfile(Request $request, UploadService $uploads): JsonResponse
    {
        foreach (['social_links', 'availability', 'booking_form_fields'] as $jsonField) {
            if (is_string($request->input($jsonField))) {
                $request->merge([$jsonField => json_decode($request->input($jsonField), true) ?: []]);
            }
        }

        $photoRules = $request->hasFile('profile_photo')
            ? ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120']
            : ['string', 'max:1000'];
        $coverRules = $request->hasFile('cover_image')
            ? ['image', 'mimes:jpg,jpeg,png,webp', 'max:8192']
            : ['string', 'max:1000'];
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
            'timezone' => ['sometimes', 'timezone'],
            'profile_photo' => ['sometimes', 'nullable', ...$photoRules],
            'cover_image' => ['sometimes', 'nullable', ...$coverRules],
            'social_links' => ['sometimes', 'nullable', 'array'],
            'social_links.*' => ['nullable', 'url', 'max:500'],
            'portfolio_links' => ['sometimes', 'nullable', 'array'],
            'portfolio_links.*' => ['url', 'max:500'],
            'digital_product_links' => ['sometimes', 'nullable', 'array'],
            'digital_product_links.*' => ['url', 'max:500'],
            'booking_form_fields' => ['sometimes', 'nullable', 'array', 'max:8'],
            'booking_form_fields.*.label' => ['required_with:booking_form_fields', 'string', 'max:120'],
            'booking_form_fields.*.type' => ['required_with:booking_form_fields', Rule::in(['text', 'textarea', 'select', 'checkbox'])],
            'booking_form_fields.*.required' => ['sometimes', 'boolean'],
            'booking_form_fields.*.options' => ['sometimes', 'nullable', 'array', 'max:12'],
            'booking_form_fields.*.options.*' => ['nullable', 'string', 'max:80'],
            'availability' => ['sometimes', 'array'],
            'availability.*.day_of_week' => ['required_with:availability', 'integer', 'between:0,6'],
            'availability.*.start_time' => ['required_with:availability', 'date_format:H:i'],
            'availability.*.end_time' => ['required_with:availability', 'date_format:H:i', 'after:start_time'],
        ]);

        $provider = $request->user()->providerProfile;
        if (array_key_exists('booking_form_fields', $validated) && ! $request->user()->hasPaidPlan()) {
            return response()->json([
                'message' => 'Custom booking questions are available on paid plans.',
                'errors' => [
                    'booking_form_fields' => ['Custom booking questions are available on paid plans.'],
                ],
            ], 422);
        }

        if ((array_key_exists('cover_image', $validated) || $request->hasFile('cover_image')) && ! $request->user()->hasPaidPlan()) {
            $incomingCover = $request->hasFile('cover_image') ? null : ($validated['cover_image'] ?? null);
            $coverChanged = $request->hasFile('cover_image')
                || (string) ($incomingCover ?? '') !== (string) ($provider->cover_image ?? '');

            if ($coverChanged) {
                return response()->json([
                    'message' => 'Cover image editing is available on the Pro plan.',
                    'errors' => [
                        'cover_image' => ['Cover image editing is available on the Pro plan.'],
                    ],
                ], 422);
            }

            unset($validated['cover_image']);
        }

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
            $validated['profile_photo'] = $uploads->store($request->file('profile_photo'))['path'];
        } elseif (isset($validated['profile_photo']) && ! is_string($validated['profile_photo'])) {
            unset($validated['profile_photo']);
        }
        if ($request->hasFile('cover_image')) {
            $validated['cover_image'] = $uploads->store($request->file('cover_image'))['path'];
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

            // Auto-unverify when key profile fields change
            $verificationFields = ['profession', 'bio', 'location', 'country', 'city', 
                'contact_email', 'contact_phone', 'website', 'profile_photo', 'cover_image'];
            $changedVerificationField = collect($verificationFields)
                ->contains(fn ($field) => array_key_exists($field, $validated));
            
            if ($changedVerificationField && $provider->verified) {
                $provider->update(['verified' => false]);
                Cache::forget('public.home.payload.v6');
                Cache::forget('public.home.payload.v5');
                \Illuminate\Support\Facades\Artisan::call('cache:clear');
            }
        });

        return $this->success($provider->fresh()->load(['user:id,name,email,phone', 'user.activeSubscription.planDefinition', 'category', 'services', 'portfolioItems', 'digitalProducts', 'availability' => fn ($query) => $query->where('is_active', true)->orderBy('day_of_week')->orderBy('start_time')]), 'Profile updated.');
    }

    public function uploadPortfolioImage(Request $request, UploadService $uploads): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($provider, 404, 'Provider profile not found.');
        abort_if($provider->portfolioItems()->count() >= 6, 422, 'You can add up to 6 portfolio images.');

        $validated = $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'title' => ['nullable', 'string', 'max:120'],
        ]);

        $stored = $uploads->store($validated['image']);
        $item = $provider->portfolioItems()->create([
            'title' => $validated['title'] ?? 'Portfolio image '.($provider->portfolioItems()->count() + 1),
            'media_url' => $stored['path'],
            'media_type' => 'image',
            'sort_order' => (int) ($provider->portfolioItems()->max('sort_order') ?? 0) + 1,
        ]);

        return $this->success($item, 'Portfolio image uploaded.', 201);
    }

    public function deletePortfolioImage(Request $request, PortfolioItem $portfolioItem): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($provider && (int) $portfolioItem->provider_id === (int) $provider->id, 404);

        $path = $portfolioItem->media_url;
        $portfolioItem->delete();
        $this->deleteStoredUpload($path);

        return $this->success($provider->fresh()->load(['portfolioItems' => fn ($query) => $query->orderBy('sort_order')]), 'Portfolio image removed.');
    }

    public function completeOnboarding(Request $request, UploadService $uploads): JsonResponse
    {
        foreach (['social_links', 'availability'] as $jsonField) {
            if (is_string($request->input($jsonField))) {
                $request->merge([$jsonField => json_decode($request->input($jsonField), true) ?: []]);
            }
        }

        $paidVerificationRequired = $this->hasPendingPaidPlanSelection($request->user());
        $storedUploadRule = function (string $attribute, mixed $value, \Closure $fail): void {
            if ($value instanceof \Illuminate\Http\UploadedFile) {
                return;
            }

            if (! is_string($value) || ! str_starts_with($value, 'uploads/') || str_contains($value, '..')) {
                $fail('The selected upload is invalid.');
            }
        };
        $storedVerificationUploadRule = function (string $attribute, mixed $value, \Closure $fail): void {
            if ($value instanceof \Illuminate\Http\UploadedFile) {
                return;
            }

            if (! is_string($value) || (! preg_match('/^media:\d+$/', $value) && ! str_starts_with($value, 'uploads/')) || str_contains($value, '..')) {
                $fail('The selected verification upload is invalid.');
            }
        };
        $profilePhotoRules = $request->hasFile('profile_photo')
            ? ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120']
            : ['required', 'string', 'max:1000', $storedUploadRule];
        $coverImageRules = $request->hasFile('cover_image')
            ? ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192']
            : ['required', 'string', 'max:1000', $storedUploadRule];
        $storedOrImageRule = ['nullable', $storedUploadRule];
        $storedOrDocumentRule = ['nullable', $storedVerificationUploadRule];

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'provider_category_id' => ['required', 'integer', 'exists:provider_categories,id'],
            'profession' => ['required', 'string', 'max:120'],
            'bio' => [
                'required',
                'string',
                'min:180',
                'max:5000',
                function (string $attribute, mixed $value, \Closure $fail): void {
                    preg_match_all("/\b[\pL\pN][\pL\pN'-]*\b/u", strip_tags((string) $value), $matches);
                    if (count($matches[0] ?? []) < 40) {
                        $fail('The About Me / Description must be well written and at least 40 words.');
                    }
                },
            ],
            'profile_photo' => $profilePhotoRules,
            'cover_image' => $coverImageRules,
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
            'portfolio_images' => ['sometimes', 'array', 'max:6'],
            'portfolio_images.*' => $request->hasFile('portfolio_images') ? ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120'] : $storedOrImageRule,
            'verification_years' => [$paidVerificationRequired ? 'required' : 'nullable', 'integer', 'min:0', 'max:80'],
            'verification_experience' => [$paidVerificationRequired ? 'required' : 'nullable', 'string', 'max:2000'],
            'verification_credentials' => ['nullable', 'string', 'max:2000'],
            'verification_license_details' => ['nullable', 'string', 'max:2000'],
            'certification_documents' => [$paidVerificationRequired ? 'required_without:license_documents' : 'nullable', 'array', 'max:5'],
            'certification_documents.*' => $request->hasFile('certification_documents') ? ['file', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx', 'max:10240'] : $storedOrDocumentRule,
            'license_documents' => [$paidVerificationRequired ? 'required_without:certification_documents' : 'nullable', 'array', 'max:5'],
            'license_documents.*' => $request->hasFile('license_documents') ? ['file', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx', 'max:10240'] : $storedOrDocumentRule,
            'terms_accepted' => ['accepted'],
        ]);

        $provider = $request->user()->providerProfile;

        $verification = DB::transaction(function () use ($request, $provider, $validated, $uploads): VerificationRequest {
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
                'profile_photo' => $request->hasFile('profile_photo')
                    ? $uploads->store($request->file('profile_photo'), $request->user(), 'provider_onboarding_profile')['path']
                    : $validated['profile_photo'],
                'cover_image' => $request->hasFile('cover_image')
                    ? $uploads->store($request->file('cover_image'), $request->user(), 'provider_onboarding_cover')['path']
                    : $validated['cover_image'],
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
                'account_approved_at' => null,
                'account_declined_at' => null,
                'account_review_notes' => null,
            ]);

            $provider->availability()->delete();
            foreach ($validated['availability'] as $slot) {
                $provider->availability()->create($slot + ['is_active' => true]);
            }

            $portfolioImages = $request->hasFile('portfolio_images')
                ? array_map(fn ($image) => $uploads->store($image, $request->user(), 'provider_onboarding_portfolio')['path'], array_slice($request->file('portfolio_images', []), 0, 6))
                : array_slice($validated['portfolio_images'] ?? [], 0, 6);

            foreach ($portfolioImages as $index => $imagePath) {
                $provider->portfolioItems()->create([
                    'title' => 'Portfolio image '.($index + 1),
                    'media_url' => $imagePath,
                    'media_type' => 'image',
                    'sort_order' => $index,
                ]);
            }

            $portfolioLinks = $provider->portfolioItems()
                ->latest()
                ->limit(6)
                ->pluck('media_url')
                ->filter()
                ->values()
                ->all();
            $certificationFiles = [];
            $certificationFiles = $request->hasFile('certification_documents')
                ? array_map(fn ($document) => $uploads->storeVerificationDocument($document, $request->user(), 'provider_verification_certification')['path'], array_slice($request->file('certification_documents', []), 0, 5))
                : $this->validateVerificationReferences(array_slice($validated['certification_documents'] ?? [], 0, 5), $request->user(), 'provider_verification_certification');

            $licenseFiles = [];
            $licenseFiles = $request->hasFile('license_documents')
                ? array_map(fn ($document) => $uploads->storeVerificationDocument($document, $request->user(), 'provider_verification_license')['path'], array_slice($request->file('license_documents', []), 0, 5))
                : $this->validateVerificationReferences(array_slice($validated['license_documents'] ?? [], 0, 5), $request->user(), 'provider_verification_license');

            $professionalInfo = implode("\n\n", array_filter([
                "Professional title: {$validated['profession']}",
                "Location: {$validated['city']}, {$validated['country']}",
                "Starting price: {$validated['default_currency']} {$validated['base_price']}",
                array_key_exists('verification_years', $validated) && $validated['verification_years'] !== null ? "Years of experience: {$validated['verification_years']}" : null,
                filled($validated['verification_experience'] ?? null) ? "Experience:\n{$validated['verification_experience']}" : null,
                filled($validated['verification_credentials'] ?? null) ? "Training, certification, or credentials:\n{$validated['verification_credentials']}" : null,
                filled($validated['verification_license_details'] ?? null) ? "License or registration details:\n{$validated['verification_license_details']}" : null,
                "Business description:\n{$validated['bio']}",
                'Provider confirmed that the submitted listing and verification details are accurate.',
            ]));

            return $provider->verificationRequests()->create([
                'portfolio_links' => $portfolioLinks,
                'social_links' => $socialLinks,
                'professional_info' => $professionalInfo,
                'certification_files' => $certificationFiles,
                'license_files' => $licenseFiles,
                'status' => 'pending',
            ]);
        });

        $userId = $request->user()->id;
        $userName = $request->user()->name;
        $providerId = $provider->id;
        $verificationId = $verification->id;
        dispatch(function () use ($userId, $userName, $providerId, $verificationId): void {
            $user = User::find($userId);
            $user?->notify(new PlatformUpdateNotification(
                'Provider details received',
                'Your provider details have been received and are waiting for admin approval. You will be notified once the review is complete.',
                'View status',
                rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/onboarding',
                ['provider_id' => $providerId],
            ));
            User::where('role', 'admin')->where('is_active', true)->get()->each->notify(new PlatformUpdateNotification(
                'Provider approval required',
                "{$userName} submitted provider details for approval.",
                'Review verification',
                rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/verification',
                ['provider_id' => $providerId, 'user_id' => $userId, 'verification_id' => $verificationId],
            ));
        })->afterResponse();

        return $this->success([
            'provider' => $provider->fresh()->load(['user:id,name,email,phone', 'category', 'availability']),
            'verification' => $verification->fresh(),
            'redirect_to' => '/provider/onboarding',
            'approval_required' => true,
            'payment_required' => false,
            'checkout_required' => false,
        ], 'Your provider details have been received. You will be notified once an admin approves your account.');
    }

    private function hasPendingPaidPlanSelection(User $user): bool
    {
        if ($user->hasPaidPlan()) {
            return false;
        }

        return $user->subscriptions()
            ->whereIn('plan', ['paid', 'pro'])
            ->whereIn('status', ['expired', 'pending'])
            ->latest()
            ->get()
            ->contains(fn (Subscription $subscription): bool => (bool) ($subscription->metadata['selected_at_registration'] ?? false));
    }

    public function analytics(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', Rule::in(['day', 'week', 'month'])],
            'date_from' => ['nullable', 'date_format:Y-m-d', 'required_with:date_to'],
            'date_to' => ['nullable', 'date_format:Y-m-d', 'required_with:date_from', 'after_or_equal:date_from'],
            'compare_date_from' => ['nullable', 'date_format:Y-m-d', 'required_with:compare_date_to'],
            'compare_date_to' => ['nullable', 'date_format:Y-m-d', 'required_with:compare_date_from', 'after_or_equal:compare_date_from'],
        ]);
        $provider = $request->user()->providerProfile;
        $period = $validated['period'] ?? 'month';
        $from = isset($validated['date_from'])
            ? Carbon::createFromFormat('Y-m-d', $validated['date_from'])->startOfDay()
            : match ($period) {
                'day' => now()->startOfDay(),
                'week' => now()->startOfWeek(),
                default => now()->startOfMonth(),
            };
        $to = isset($validated['date_to'])
            ? Carbon::createFromFormat('Y-m-d', $validated['date_to'])->endOfDay()
            : now()->endOfDay();
        abort_if($from->diffInDays($to) > 366, 422, 'Analytics ranges cannot exceed 367 days.');

        $current = $this->analyticsRange($provider, $from, $to);
        $comparison = null;
        if (isset($validated['compare_date_from'], $validated['compare_date_to'])) {
            $compareFrom = Carbon::createFromFormat('Y-m-d', $validated['compare_date_from'])->startOfDay();
            $compareTo = Carbon::createFromFormat('Y-m-d', $validated['compare_date_to'])->endOfDay();
            abort_if($compareFrom->diffInDays($compareTo) > 366, 422, 'Comparison ranges cannot exceed 367 days.');
            $comparison = $this->analyticsRange($provider, $compareFrom, $compareTo);
        }

        return $this->success([
            'period' => $period,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            ...$current,
            'current' => $current,
            'comparison' => $comparison,
        ]);
    }

    private function analyticsRange($provider, Carbon $from, Carbon $to): array
    {
        $providerId = (int) $provider->id;
        $views = ProfileView::where('provider_id', $providerId)
            ->whereDate('viewed_on', '>=', $from->toDateString())
            ->whereDate('viewed_on', '<=', $to->toDateString())
            ->select('viewed_on', DB::raw('count(*) as total'))
            ->groupBy('viewed_on')
            ->orderBy('viewed_on')
            ->get();
        $bookings = Booking::where('provider_id', $providerId)->whereBetween('created_at', [$from, $to]);
        $payments = Payment::where('provider_id', $providerId)->where('status', 'paid')->whereBetween('paid_at', [$from, $to]);
        $viewCount = (int) $views->sum('total');
        $bookingCount = (clone $bookings)->count();
        $completedCount = (clone $bookings)->where('status', 'completed')->count();
        $cancelledCount = (clone $bookings)->whereIn('status', ['cancelled', 'rejected'])->count();
        $retention = $this->customerRetention($providerId, $from, $to);
        $primaryCurrency = strtoupper((string) ($provider->default_currency ?? config('currencies.default', 'NGN')));
        $revenue = (float) (clone $payments)->where('currency', $primaryCurrency)->sum('amount');
        $paidPaymentCount = (clone $payments)->where('currency', $primaryCurrency)->count();
        $viewsByDate = $views->mapWithKeys(fn ($row) => [$row->viewed_on->toDateString() => (int) $row->total]);
        $bookingsByDate = (clone $bookings)
            ->selectRaw('DATE(created_at) as analytics_date, count(*) as total')
            ->groupBy('analytics_date')
            ->pluck('total', 'analytics_date');
        $trend = collect();
        for ($date = $from->copy()->startOfDay(); $date->lte($to); $date->addDay()) {
            $key = $date->toDateString();
            $trend->push([
                'date' => $key,
                'label' => $date->format($from->diffInDays($to) > 60 ? 'M j' : 'D, M j'),
                'views' => (int) ($viewsByDate[$key] ?? 0),
                'bookings' => (int) ($bookingsByDate[$key] ?? 0),
            ]);
        }

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'days' => $from->diffInDays($to) + 1],
            'profile_views' => $views,
            'profile_view_count' => $viewCount,
            'booking_count' => $bookingCount,
            'completed_booking_count' => $completedCount,
            'cancelled_booking_count' => $cancelledCount,
            'unique_customers' => $retention['period_customers'],
            'conversion_rate' => $viewCount > 0 ? round($bookingCount / $viewCount * 100, 1) : 0,
            'completion_rate' => $bookingCount > 0 ? round($completedCount / $bookingCount * 100, 1) : 0,
            'cancellation_rate' => $bookingCount > 0 ? round($cancelledCount / $bookingCount * 100, 1) : 0,
            'customer_retention_rate' => $retention['rate'],
            'returning_customers' => $retention['returning_customers'],
            'period_customers' => $retention['period_customers'],
            'revenue' => $revenue,
            'revenue_currency' => $primaryCurrency,
            'average_booking_value' => $paidPaymentCount > 0 ? round($revenue / $paidPaymentCount, 2) : 0,
            'trend' => $trend,
            'service_popularity' => (clone $bookings)->select('service_id', DB::raw('count(*) as bookings_count'))->with('service:id,name')->groupBy('service_id')->orderByDesc('bookings_count')->get(),
            'status_breakdown' => (clone $bookings)->select('status', DB::raw('count(*) as total'))->groupBy('status')->pluck('total', 'status'),
        ];
    }

    private function customerRetention(int $providerId, $from, $to = null): array
    {
        $retentionStatuses = ['pending', 'confirmed', 'completed'];
        $periodCustomers = Booking::where('provider_id', $providerId)
            ->whereIn('status', $retentionStatuses)
            ->where('created_at', '>=', $from)
            ->when($to, fn ($query) => $query->where('created_at', '<=', $to))
            ->select('customer_id', DB::raw('count(*) as period_bookings'))
            ->groupBy('customer_id')
            ->get();

        $periodCustomerIds = $periodCustomers->pluck('customer_id')->filter()->values();
        if ($periodCustomerIds->isEmpty()) {
            return ['rate' => 0.0, 'returning_customers' => 0, 'period_customers' => 0];
        }

        $previousCustomerIds = Booking::where('provider_id', $providerId)
            ->whereIn('status', $retentionStatuses)
            ->where('created_at', '<', $from)
            ->whereIn('customer_id', $periodCustomerIds)
            ->distinct()
            ->pluck('customer_id');

        $returningCustomerIds = $periodCustomers
            ->filter(fn ($customer) => (int) $customer->period_bookings > 1 || $previousCustomerIds->contains($customer->customer_id))
            ->pluck('customer_id')
            ->unique()
            ->values();

        return [
            'rate' => round($returningCustomerIds->count() / $periodCustomerIds->count() * 100, 1),
            'returning_customers' => $returningCustomerIds->count(),
            'period_customers' => $periodCustomerIds->count(),
        ];
    }

    public function verification(Request $request): JsonResponse
    {
        return $this->success([
            'verified' => $request->user()->providerProfile->verified,
            'request' => $request->user()->providerProfile->verificationRequests()->latest()->first(),
        ]);
    }

    public function uploadVerificationFile(Request $request, UploadService $uploads): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(['certification', 'license'])],
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx', 'max:10240'],
        ]);

        $stored = $uploads->storeVerificationDocument(
            $validated['file'],
            $request->user(),
            'provider_verification_'.$validated['type'],
        );

        return $this->success([
            ...$stored,
            'type' => $validated['type'],
        ], 'Verification file uploaded.', 201);
    }

    public function submitVerification(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_if($provider->verificationRequests()->where('status', 'pending')->exists(), 422, 'A verification request is already under review.');

        $validated = $request->validate([
            'portfolio_links' => ['required', 'array', 'min:1'],
            'portfolio_links.*' => ['required', 'string', 'max:1000'],
            'social_links' => ['nullable', 'array'],
            'social_links.*' => ['nullable', 'url', 'max:500'],
            'professional_info' => ['required', 'string', 'max:5000'],
            'certification_files' => ['nullable', 'array', 'max:5'],
            'certification_files.*' => ['required', 'string', 'max:1000'],
            'license_files' => ['nullable', 'array', 'max:5'],
            'license_files.*' => ['required', 'string', 'max:1000'],
        ]);

        $verification = VerificationRequest::create([
            'provider_id' => $provider->id,
            'portfolio_links' => $validated['portfolio_links'],
            'social_links' => array_filter($validated['social_links'] ?? $provider->social_links ?? []),
            'professional_info' => $validated['professional_info'],
            'certification_files' => $this->validateVerificationReferences($validated['certification_files'] ?? [], $request->user(), 'provider_verification_certification'),
            'license_files' => $this->validateVerificationReferences($validated['license_files'] ?? [], $request->user(), 'provider_verification_license'),
        ]);

        User::where('role', 'admin')->where('is_active', true)->get()->each->notify(new PlatformUpdateNotification(
            'New verification request',
            "{$request->user()->name} submitted a provider verification request.",
            'Review verification',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/verification',
            ['verification_id' => $verification->id, 'provider_id' => $provider->id],
        ));

        return $this->success($verification, 'Verification request submitted.', 201);
    }

    private function completion($provider): int
    {
        $checks = [$provider->profession, $provider->bio, $provider->location, $provider->profile_photo, $provider->services()->exists()];

        return (int) round(collect($checks)->filter()->count() / count($checks) * 100);
    }

    private function validateVerificationReferences(array $references, User $user, string $collection): array
    {
        return collect($references)->map(function (mixed $reference) use ($user, $collection): string {
            $reference = trim((string) $reference);
            $query = UploadedMedia::query()
                ->where('user_id', $user->id)
                ->where('collection', $collection);

            $media = preg_match('/^media:(\d+)$/', $reference, $match)
                ? $query->whereKey((int) $match[1])->where('disk', 'verification')->first()
                : $query->where('path', $reference)->first();

            if (! $media) {
                throw ValidationException::withMessages([
                    'verification_files' => ['A verification document is missing, expired, or does not belong to your account.'],
                ]);
            }

            return $media->disk === 'verification' ? 'media:'.$media->id : $media->path;
        })->values()->all();
    }

    private function deleteStoredUpload(?string $path): void
    {
        $path = str_replace('\\', '/', trim((string) $path));
        if ($path === '' || str_starts_with($path, '/') || str_contains($path, '..') || preg_match('#^https?://#i', $path)) {
            return;
        }

        Storage::disk((string) config('filesystems.upload_disk', 'public'))->delete(preg_replace('#^storage/#', '', $path));
    }
}
