<?php

namespace Tests\Feature;

use App\Models\Availability;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\CommunityPost;
use App\Models\ContactEnquiry;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Opportunity;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Notifications\BookingStatusNotification;
use App\Notifications\BeautyProVerifyEmailNotification;
use App\Notifications\PlatformUpdateNotification;
use App\Notifications\ProviderContactEnquiryNotification;
use App\Services\UploadService;
use App\Services\ContentNewsletterService;
use Carbon\Carbon;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BackendMvpTest extends TestCase
{
    use RefreshDatabase;

    public function test_provider_registration_creates_profile_and_session(): void
    {
        Notification::fake();
        $this->withSession(['_token' => 'registration-csrf-token'])
            ->withHeader('X-CSRF-TOKEN', 'registration-csrf-token')
            ->withHeader('Referer', rtrim(config('app.url'), '/').'/');

        $response = $this->postJson('/api/auth/register', [
            'name' => 'Demo Artist',
            'email' => 'artist@example.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'role' => 'provider',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.user.role', 'provider')
            ->assertJsonPath('data.user.provider_profile.profession', 'Beauty Professional');
        $this->assertNull($response->json('data.token'));
        $this->assertDatabaseHas('provider_profiles', ['slug' => 'demo-artist']);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $user = User::where('email', 'artist@example.test')->firstOrFail();
        Notification::assertSentTo($user, BeautyProVerifyEmailNotification::class);
        Notification::assertNotSentTo($user, PlatformUpdateNotification::class);
        $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.email', 'artist@example.test');
    }

    public function test_guest_customer_can_create_account_later_with_booking_email(): void
    {
        Notification::fake();
        [$provider] = $this->provider('Guest Upgrade Studio', true);
        $service = $provider->services()->create(['name' => 'Guest Facial', 'category' => 'Skincare', 'service_type' => 'in_person', 'price' => 18000, 'duration_minutes' => 60]);
        $date = Carbon::tomorrow();
        if ($date->dayOfWeek === 0) {
            $date->addDay();
        }
        Availability::create(['provider_id' => $provider->id, 'day_of_week' => $date->dayOfWeek, 'start_time' => '09:00', 'end_time' => '17:00']);

        $bookingId = $this->postJson('/api/guest-bookings', [
            'provider_id' => $provider->id,
            'service_id' => $service->id,
            'date' => $date->toDateString(),
            'time' => '10:00',
            'payment_method' => 'manual',
            'customer' => [
                'name' => 'Guest Client',
                'email' => 'guest-client@example.test',
                'phone' => '+2348012345678',
                'create_account' => false,
            ],
        ])->assertCreated()->json('data.id');

        $guest = User::where('email', 'guest-client@example.test')->firstOrFail();
        $this->assertTrue($guest->is_guest);
        $this->assertSame($guest->id, Booking::findOrFail($bookingId)->customer_id);
        Notification::assertSentTo($guest, BookingStatusNotification::class, function (BookingStatusNotification $notification) use ($guest) {
            $mail = $notification->toMail($guest);

            return str_contains($mail->actionUrl, '/register?')
                && str_contains($mail->actionUrl, 'role=customer')
                && str_contains($mail->actionUrl, 'guest-client%40example.test');
        });

        $this->withSession(['_token' => 'customer-registration-csrf-token'])
            ->withHeader('X-CSRF-TOKEN', 'customer-registration-csrf-token')
            ->withHeader('Referer', rtrim(config('app.url'), '/').'/register?role=customer');

        $this->postJson('/api/auth/register', [
            'name' => 'Guest Client',
            'email' => 'guest-client@example.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'role' => 'customer',
        ])->assertCreated()
            ->assertJsonPath('data.user.id', $guest->id)
            ->assertJsonPath('data.user.role', 'customer');

        $this->assertFalse($guest->fresh()->is_guest);
        $this->assertSame($guest->id, Booking::findOrFail($bookingId)->customer_id);
        $this->assertSame(2, User::count());
    }

    public function test_notification_email_uses_admin_configured_logo(): void
    {
        AppSetting::setValue('branding.email_logo_url', '/storage/uploads/email-logo.png');
        $customer = User::factory()->create(['name' => 'Logo Customer']);
        [$provider] = $this->provider('Logo Mail Studio', true);
        $service = $provider->services()->create(['name' => 'Logo Facial', 'price' => 12000, 'duration_minutes' => 45]);
        $booking = Booking::create([
            'provider_id' => $provider->id,
            'customer_id' => $customer->id,
            'service_id' => $service->id,
            'date' => now()->addDay()->toDateString(),
            'time' => '10:00',
            'status' => 'pending',
        ]);

        $html = (new BookingStatusNotification($booking, 'Your booking request has been created.'))->toMail($customer)->render();

        $this->assertStringContainsString('/storage/uploads/email-logo.png', $html);
        $this->assertStringContainsString('max-height: 46px', $html);
    }

    public function test_subscription_plans_use_browser_location_currency(): void
    {
        $this->withHeader('X-BPHQ-Country', 'US')
            ->withHeader('X-BPHQ-Timezone', 'Africa/Lagos')
            ->getJson('/api/currencies')
            ->assertOk()
            ->assertJsonPath('data.detected', 'USD');

        $this->withHeader('Accept-Language', 'en-GB,en-US;q=0.9')
            ->withHeader('X-BPHQ-Country', '')
            ->withHeader('X-BPHQ-Timezone', 'Africa/Lagos')
            ->getJson('/api/currencies')
            ->assertOk()
            ->assertJsonPath('data.detected', 'NGN');

        $this->withHeader('Accept-Language', 'en-GB,en-US;q=0.9')
            ->withHeader('X-BPHQ-Country', '')
            ->withHeader('X-BPHQ-Timezone', 'Africa/Lagos')
            ->getJson('/api/subscription-plans')
            ->assertOk()
            ->assertJsonPath('data.detected_currency', 'NGN')
            ->assertJsonPath('data.plans.1.display_currency', 'NGN');
    }

    public function test_email_verification_resend_is_available_every_thirty_seconds(): void
    {
        Notification::fake();
        $user = User::factory()->unverified()->create();
        Sanctum::actingAs($user);

        $this->postJson('/api/email/verification-notification')->assertOk();
        Notification::assertSentTo($user, BeautyProVerifyEmailNotification::class);

        $this->postJson('/api/email/verification-notification')->assertTooManyRequests();

        $this->travel(31)->seconds();
        $this->postJson('/api/email/verification-notification')->assertOk();
    }

    public function test_unverified_provider_cannot_submit_onboarding(): void
    {
        Notification::fake();
        $user = User::factory()->provider()->unverified()->create(['name' => 'Unverified Artist']);
        ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'unverified-artist',
            'profession' => 'Beauty Professional',
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/provider/onboarding', [])
            ->assertForbidden();
    }

    public function test_paystack_subscription_checkout_uses_recurring_plan(): void
    {
        AppSetting::setValue('paystack.test_secret_key', 'sk_test_bphq', true);
        Notification::fake();
        $user = User::factory()->provider()->create(['email' => 'provider@example.test']);
        ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'provider-checkout',
            'profession' => 'Beauty Professional',
            'verified' => true,
            'onboarding_completed_at' => now(),
        ]);
        Sanctum::actingAs($user);

        Http::fake([
            'https://api.paystack.co/plan' => Http::response([
                'status' => true,
                'data' => ['plan_code' => 'PLN_bphqmonthly'],
            ]),
            'https://api.paystack.co/transaction/initialize' => Http::response([
                'status' => true,
                'data' => [
                    'authorization_url' => 'https://checkout.paystack.com/bphq',
                    'access_code' => 'access_bphq',
                ],
            ]),
        ]);

        $this->postJson('/api/provider/subscription/checkout', [
            'plan' => 'paid',
            'gateway' => 'paystack',
            'currency' => 'NGN',
        ])->assertOk()
            ->assertJsonPath('data.authorization_url', 'https://checkout.paystack.com/bphq');

        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/transaction/initialize'
            && $request['plan'] === 'PLN_bphqmonthly'
            && $request['channels'] === ['card']
            && $request['metadata']['paystack_plan_code'] === 'PLN_bphqmonthly');

        $payment = SubscriptionPayment::firstOrFail();
        $this->assertSame('PLN_bphqmonthly', data_get($payment->raw_response, 'data.plan.plan_code'));
        $this->assertSame('provider_subscription', data_get($payment->raw_response, 'data.metadata.type'));
    }

    public function test_paystack_subscription_create_before_charge_success_keeps_subscription_codes(): void
    {
        AppSetting::setValue('paystack.test_secret_key', 'sk_test_bphq', true);
        Notification::fake();
        $user = User::factory()->provider()->create(['email' => 'race@example.test']);
        ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'race-checkout',
            'profession' => 'Beauty Professional',
            'verified' => true,
            'onboarding_completed_at' => now(),
        ]);
        Sanctum::actingAs($user);

        Http::fake([
            'https://api.paystack.co/plan' => Http::response([
                'status' => true,
                'data' => ['plan_code' => 'PLN_raceplan'],
            ]),
            'https://api.paystack.co/transaction/initialize' => Http::response([
                'status' => true,
                'data' => [
                    'authorization_url' => 'https://checkout.paystack.com/race',
                    'access_code' => 'access_race',
                ],
            ]),
        ]);

        $this->postJson('/api/provider/subscription/checkout', [
            'plan' => 'paid',
            'gateway' => 'paystack',
            'currency' => 'NGN',
        ])->assertOk();

        $payment = SubscriptionPayment::firstOrFail();
        $this->postPaystackWebhook([
            'event' => 'subscription.create',
            'data' => [
                'subscription_code' => 'SUB_race',
                'email_token' => 'token_race',
                'next_payment_date' => now()->addMonth()->toIso8601String(),
                'plan' => ['plan_code' => 'PLN_raceplan'],
                'customer' => ['email' => 'race@example.test'],
            ],
        ])->assertOk();

        $this->postPaystackWebhook([
            'event' => 'charge.success',
            'data' => [
                'reference' => $payment->reference,
                'amount' => 1500000,
                'currency' => 'NGN',
                'status' => 'success',
                'metadata' => [
                    'type' => 'provider_subscription',
                    'user_id' => $user->id,
                    'subscription_payment_id' => $payment->id,
                    'plan' => 'paid',
                    'plan_id' => $payment->subscription_plan_id,
                    'paystack_plan_code' => 'PLN_raceplan',
                ],
            ],
        ])->assertOk();

        $subscription = Subscription::where('user_id', $user->id)->where('status', 'active')->firstOrFail();
        $this->assertSame('SUB_race', data_get($subscription->metadata, 'paystack_subscription_code'));
        $this->assertSame('token_race', data_get($subscription->metadata, 'paystack_email_token'));
    }

    public function test_paystack_invoice_failure_marks_subscription_attention(): void
    {
        AppSetting::setValue('paystack.test_secret_key', 'sk_test_bphq', true);
        $user = User::factory()->provider()->create();
        $plan = SubscriptionPlan::where('key', 'paid')->firstOrFail();
        $subscription = Subscription::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'plan' => 'paid',
            'status' => 'active',
            'amount' => $plan->price,
            'currency' => $plan->currency,
            'starts_at' => now()->subMonth(),
            'renews_at' => now()->addDay(),
            'metadata' => [
                'gateway' => 'paystack',
                'paystack_subscription_code' => 'SUB_attention',
            ],
        ]);

        $this->postPaystackWebhook([
            'event' => 'invoice.payment_failed',
            'data' => [
                'invoice_code' => 'INV_failed',
                'status' => 'failed',
                'description' => 'Insufficient Funds',
                'subscription' => [
                    'subscription_code' => 'SUB_attention',
                    'next_payment_date' => now()->addMonth()->toIso8601String(),
                ],
            ],
        ])->assertOk();

        $subscription->refresh();
        $this->assertSame('attention', data_get($subscription->metadata, 'paystack_status'));
        $this->assertSame('invoice.payment_failed', data_get($subscription->metadata, 'paystack_last_event'));
        $this->assertSame('Insufficient Funds', data_get($subscription->metadata, 'paystack_last_invoice_description'));
    }

    public function test_provider_subscription_page_uses_provider_base_currency(): void
    {
        [$provider, $user] = $this->provider('Base Currency Studio', true);
        $provider->update(['default_currency' => 'USD']);

        Sanctum::actingAs($user);

        $this->withHeader('X-BPHQ-Country', 'NG')
            ->withHeader('X-BPHQ-Timezone', 'Africa/Lagos')
            ->getJson('/api/provider/subscription')
            ->assertOk()
            ->assertJsonPath('data.detected_currency', 'NGN')
            ->assertJsonPath('data.account_currency', 'USD')
            ->assertJsonPath('data.plans.1.display_currency', 'USD');
    }

    public function test_paid_provider_downgrade_keeps_access_until_period_end(): void
    {
        Notification::fake();
        $user = User::factory()->provider()->create();
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'downgrade-studio',
            'profession' => 'Beauty Professional',
            'verified' => true,
            'onboarding_completed_at' => now(),
        ]);
        $plan = SubscriptionPlan::where('key', 'paid')->firstOrFail();
        $renewsAt = now()->addDays(12)->startOfSecond();
        $subscription = Subscription::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'plan' => 'paid',
            'status' => 'active',
            'amount' => $plan->price,
            'currency' => $plan->currency,
            'starts_at' => now()->subDays(18),
            'renews_at' => $renewsAt,
            'metadata' => ['gateway' => 'paystack'],
        ]);

        Sanctum::actingAs($user);

        $this->postJson('/api/provider/subscription/downgrade')
            ->assertOk()
            ->assertJsonPath('data.plan', 'paid')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.metadata.cancel_at_period_end', true);

        $subscription->refresh();
        $this->assertTrue($user->fresh()->hasPaidPlan());
        $this->assertTrue($renewsAt->equalTo($subscription->ends_at));
        $this->assertFalse($profile->fresh()->verified);
        $this->assertDatabaseHas('verification_requests', [
            'provider_id' => $profile->id,
            'status' => 'rejected',
            'admin_notes' => 'Verification was declined because the provider downgraded to the free plan.',
        ]);
    }

    public function test_provider_onboarding_requires_detailed_about_description(): void
    {
        Notification::fake();
        $user = User::factory()->provider()->create(['name' => 'Brief Bio Artist']);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'brief-bio-artist',
            'profession' => 'Beauty Professional',
        ]);
        $category = ProviderCategory::firstOrFail();

        Sanctum::actingAs($user);
        $this->withHeader('Accept', 'application/json')->post('/api/provider/onboarding', [
            'name' => 'Brief Bio Artist',
            'provider_category_id' => $category->id,
            'profession' => 'Makeup Artist',
            'bio' => 'I do makeup for clients.',
            'contact_email' => 'brief@example.test',
            'contact_phone' => '+2348012345678',
            'location' => '12 Test Street',
            'country' => 'Nigeria',
            'city' => 'Lagos',
            'default_currency' => 'NGN',
            'base_price' => 20000,
            'availability' => [
                ['day_of_week' => 1, 'start_time' => '09:00', 'end_time' => '17:00'],
            ],
            'terms_accepted' => true,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('bio');

        $this->assertNull($profile->fresh()->onboarding_completed_at);
    }

    public function test_provider_can_complete_onboarding_with_uploaded_images(): void
    {
        Notification::fake();
        [$profile, $user] = $this->provider('Complete Bio Artist');
        $category = ProviderCategory::firstOrFail();
        $this->mock(UploadService::class, function ($mock): void {
            $mock->shouldReceive('store')->twice()->andReturn(
                [
                    'success' => true,
                    'url' => '/storage/uploads/profile.webp',
                    'path' => 'uploads/profile.webp',
                    'filename' => 'profile.webp',
                    'mime_type' => 'image/webp',
                    'size' => 1200,
                ],
                [
                    'success' => true,
                    'url' => '/storage/uploads/cover.webp',
                    'path' => 'uploads/cover.webp',
                    'filename' => 'cover.webp',
                    'mime_type' => 'image/webp',
                    'size' => 2400,
                ],
            );
        });

        Sanctum::actingAs($user);
        $this->post('/api/provider/onboarding', [
            'name' => 'Complete Bio Artist',
            'provider_category_id' => $category->id,
            'profession' => 'Makeup Artist',
            'bio' => 'I am a certified beauty professional with years of practical experience serving bridal clients, editorial teams, private events, and everyday customers who need reliable makeup, skincare guidance, and polished service. My work focuses on clean preparation, thoughtful consultation, durable products, punctual appointments, and friendly communication from booking through aftercare.',
            'profile_photo' => $this->tinyPngUpload('profile.png'),
            'cover_image' => $this->tinyPngUpload('cover.png'),
            'contact_email' => 'complete@example.test',
            'contact_phone' => '+2348012345678',
            'location' => '12 Test Street',
            'country' => 'Nigeria',
            'city' => 'Lagos',
            'default_currency' => 'NGN',
            'base_price' => 20000,
            'availability' => [
                ['day_of_week' => 1, 'start_time' => '09:00', 'end_time' => '17:00'],
            ],
            'verification_experience' => 'Five years of bridal, editorial, and event beauty work with repeat private clients.',
            'verification_credentials' => 'Certified makeup artist with sanitation training and portfolio references.',
            'verification_license_details' => 'Registered studio verification details available on request.',
            'verification_portfolio_url' => 'https://example.test/complete-portfolio',
            'terms_accepted' => true,
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.provider.profile_photo', 'uploads/profile.webp')
            ->assertJsonPath('data.provider.cover_image', 'uploads/cover.webp')
            ->assertJsonPath('data.redirect_to', '/provider/onboarding')
            ->assertJsonPath('data.approval_required', true)
            ->assertJsonPath('data.checkout_required', false);

        $this->assertNotNull($profile->fresh()->onboarding_completed_at);
        $this->assertFalse($profile->fresh()->verified);
        $this->assertDatabaseHas('verification_requests', [
            'provider_id' => $profile->id,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('availability', [
            'provider_id' => $profile->id,
            'day_of_week' => 1,
            'start_time' => '09:00',
            'end_time' => '17:00',
        ]);
    }

    public function test_provider_onboarding_requests_admin_approval_before_paid_checkout(): void
    {
        Notification::fake();
        $user = User::factory()->provider()->create(['name' => 'Pending Paid Artist']);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'pending-paid-artist',
            'profession' => 'Beauty Professional',
        ]);
        $plan = SubscriptionPlan::where('key', 'paid')->firstOrFail();
        Subscription::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'plan' => $plan->key,
            'status' => 'expired',
            'amount' => $plan->price,
            'currency' => $plan->currency,
            'metadata' => ['selected_at_registration' => true],
        ]);
        $category = ProviderCategory::firstOrFail();
        $this->mock(UploadService::class, function ($mock): void {
            $mock->shouldReceive('store')->twice()->andReturn(
                [
                    'success' => true,
                    'url' => '/storage/uploads/profile.webp',
                    'path' => 'uploads/profile.webp',
                    'filename' => 'profile.webp',
                    'mime_type' => 'image/webp',
                    'size' => 1200,
                ],
                [
                    'success' => true,
                    'url' => '/storage/uploads/cover.webp',
                    'path' => 'uploads/cover.webp',
                    'filename' => 'cover.webp',
                    'mime_type' => 'image/webp',
                    'size' => 2400,
                ],
            );
        });

        Sanctum::actingAs($user);
        $this->post('/api/provider/onboarding', [
            'name' => 'Pending Paid Artist',
            'provider_category_id' => $category->id,
            'profession' => 'Makeup Artist',
            'bio' => 'I am a certified beauty professional with years of practical experience serving bridal clients, editorial teams, private events, and everyday customers who need reliable makeup, skincare guidance, and polished service. My work focuses on clean preparation, thoughtful consultation, durable products, punctual appointments, and friendly communication from booking through aftercare.',
            'profile_photo' => $this->tinyPngUpload('profile.png'),
            'cover_image' => $this->tinyPngUpload('cover.png'),
            'contact_email' => 'pending-paid@example.test',
            'contact_phone' => '+2348012345678',
            'location' => '12 Test Street',
            'country' => 'Nigeria',
            'city' => 'Lagos',
            'default_currency' => 'NGN',
            'base_price' => 20000,
            'availability' => [
                ['day_of_week' => 1, 'start_time' => '09:00', 'end_time' => '17:00'],
            ],
            'verification_experience' => 'Five years of bridal, editorial, and event beauty work with repeat private clients.',
            'verification_credentials' => 'Certified makeup artist with sanitation training and portfolio references.',
            'verification_license_details' => 'Registered studio verification details available on request.',
            'verification_portfolio_url' => 'https://example.test/pending-paid-portfolio',
            'terms_accepted' => true,
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.approval_required', true)
            ->assertJsonPath('data.payment_required', false)
            ->assertJsonPath('data.checkout_required', false)
            ->assertJsonPath('data.redirect_to', '/provider/onboarding');

        $this->assertNotNull($profile->fresh()->onboarding_completed_at);
        $this->assertFalse($profile->fresh()->verified);
        $this->getJson('/api/provider/dashboard')
            ->assertForbidden()
            ->assertJsonPath('message', 'This feature is available to approved providers.');

        $verification = $profile->verificationRequests()->latest()->firstOrFail();
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);
        $this->patchJson("/api/admin/verifications/{$verification->id}", [
            'status' => 'approved',
        ])->assertOk();

        Sanctum::actingAs($user->fresh());
        $this->getJson('/api/provider/dashboard')
            ->assertOk()
            ->assertJsonPath('data.pending_paid_plan_selection', true)
            ->assertJsonPath('data.payment_required', true);
    }

    public function test_provider_can_upload_and_remove_portfolio_images_from_dashboard(): void
    {
        [$provider, $providerUser] = $this->provider('Portfolio Dashboard Studio', true);
        $this->mock(UploadService::class, function ($mock): void {
            $mock->shouldReceive('store')->once()->andReturn([
                'success' => true,
                'url' => '/storage/uploads/optimized-portfolio.webp',
                'path' => 'uploads/optimized-portfolio.webp',
                'filename' => 'optimized-portfolio.webp',
                'mime_type' => 'image/webp',
                'size' => 1200,
            ]);
        });

        Sanctum::actingAs($providerUser);
        $itemId = $this->withHeader('Accept', 'application/json')->post('/api/provider/profile/portfolio', [
            'image' => $this->tinyPngUpload('portfolio.png'),
        ])->assertCreated()
            ->assertJsonPath('data.media_url', 'uploads/optimized-portfolio.webp')
            ->json('data.id');

        $this->assertDatabaseHas('portfolio_items', [
            'id' => $itemId,
            'provider_id' => $provider->id,
            'media_url' => 'uploads/optimized-portfolio.webp',
            'media_type' => 'image',
        ]);

        $this->deleteJson("/api/provider/profile/portfolio/{$itemId}")
            ->assertOk()
            ->assertJsonCount(0, 'data.portfolio_items');

        $this->assertDatabaseMissing('portfolio_items', ['id' => $itemId]);
    }

    public function test_free_provider_cannot_manage_custom_booking_questions(): void
    {
        $user = User::factory()->provider()->create(['name' => 'Free Booking Profile']);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'free-booking-profile-'.$user->id,
            'profession' => 'Beauty Professional',
            'location' => 'Lagos',
            'verified' => true,
            'onboarding_completed_at' => now(),
        ]);

        Sanctum::actingAs($user);
        $this->putJson('/api/provider/profile', [
            'booking_form_fields' => [
                ['label' => 'What result are you hoping for?', 'type' => 'textarea', 'required' => true],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('booking_form_fields');

        $this->assertSame([], $profile->fresh()->booking_form_fields ?? []);
    }

    public function test_provider_can_create_digital_product_with_link_and_uploaded_cover(): void
    {
        [$provider, $providerUser] = $this->provider('Digital Upload Studio', true);
        $this->mock(UploadService::class, function ($mock): void {
            $mock->shouldReceive('store')->once()->andReturn([
                'success' => true,
                'url' => '/storage/uploads/digital-cover.webp',
                'path' => 'uploads/digital-cover.webp',
                'filename' => 'digital-cover.webp',
                'mime_type' => 'image/webp',
                'size' => 1400,
            ]);
        });

        Sanctum::actingAs($providerUser);
        $this->post('/api/provider/digital-products', [
            'name' => 'Client Prep Guide',
            'description' => 'A practical download for clients preparing for a beauty appointment.',
            'price' => 1500,
            'url' => 'https://example.com/client-prep-guide',
            'image_file' => $this->tinyPngUpload('cover.png'),
            'is_active' => true,
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('data.url', 'https://example.com/client-prep-guide')
            ->assertJsonPath('data.image', 'uploads/digital-cover.webp');

        $this->assertDatabaseHas('digital_products', [
            'provider_id' => $provider->id,
            'name' => 'Client Prep Guide',
            'url' => 'https://example.com/client-prep-guide',
            'image' => 'uploads/digital-cover.webp',
        ]);
    }

    public function test_provider_verification_accepts_uploaded_file_paths(): void
    {
        [$provider, $providerUser] = $this->provider('Verification Upload Studio', true);
        $this->mock(UploadService::class, function ($mock): void {
            $mock->shouldReceive('store')->once()->andReturn([
                'success' => true,
                'url' => '/storage/uploads/certificate.pdf',
                'path' => 'uploads/certificate.pdf',
                'filename' => 'certificate.pdf',
                'mime_type' => 'application/pdf',
                'size' => 8000,
            ]);
        });

        Sanctum::actingAs($providerUser);
        $certificate = $this->post('/api/provider/verification/files', [
            'type' => 'certification',
            'file' => UploadedFile::fake()->create('certificate.pdf', 20, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()
            ->assertJsonPath('data.path', 'uploads/certificate.pdf')
            ->json('data.path');

        $this->postJson('/api/provider/verification', [
            'portfolio_links' => ['uploads/portfolio-proof.webp'],
            'professional_info' => 'Licensed provider with documented training and a completed professional portfolio.',
            'certification_files' => [$certificate],
            'license_files' => ['uploads/license.pdf'],
        ])->assertCreated()
            ->assertJsonPath('data.certification_files.0', 'uploads/certificate.pdf')
            ->assertJsonPath('data.license_files.0', 'uploads/license.pdf');

        $this->assertDatabaseHas('verification_requests', [
            'provider_id' => $provider->id,
            'status' => 'pending',
        ]);
    }

    public function test_login_me_and_role_protection_work_with_sanctum(): void
    {
        $customer = User::factory()->create(['email' => 'customer@example.test', 'password' => 'Password123']);
        $this->withSession(['_token' => 'login-csrf-token'])
            ->withHeader('X-CSRF-TOKEN', 'login-csrf-token')
            ->withHeader('Referer', rtrim(config('app.url'), '/').'/');

        $login = $this->postJson('/api/auth/login', ['email' => $customer->email, 'password' => 'Password123']);
        $login->assertOk();
        $this->assertNull($login->json('data.token'));

        $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.id', $customer->id);
        $this->getJson('/api/provider/dashboard')->assertForbidden();
    }

    public function test_password_reset_and_signed_email_verification_work(): void
    {
        $user = User::factory()->unverified()->create(['password' => 'OldPassword123']);
        $token = Password::createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email, 'token' => $token,
            'password' => 'NewPassword123', 'password_confirmation' => 'NewPassword123',
        ])->assertOk();

        $mail = (new VerifyEmail)->toMail($user);
        $this->assertStringContainsString("/verify-email/{$user->id}/", $mail->actionUrl);
        $query = parse_url($mail->actionUrl, PHP_URL_QUERY);
        $apiUrl = url("/api/email/verify/{$user->id}/".sha1($user->email)).'?'.$query;
        $this->getJson($apiUrl)->assertOk()->assertJsonPath('data.id', $user->id);
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_email_verification_link_can_verify_current_user_when_original_id_is_missing(): void
    {
        $user = User::factory()->unverified()->create(['email' => 'current-link@example.test']);
        $missingId = $user->id + 1000;
        $hash = sha1($user->email);
        $apiUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(60),
            ['id' => $missingId, 'hash' => $hash],
            false
        );

        $this->getJson($apiUrl)->assertOk()->assertJsonPath('data.id', $user->id);
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_directory_filters_and_profile_slug_are_public(): void
    {
        [$provider] = $this->provider('Maya Beauty', true, 'Lagos');
        $provider->services()->create(['name' => 'Soft Glam', 'category' => 'Makeup', 'service_type' => 'in_person', 'price' => 25000, 'duration_minutes' => 60]);

        $this->getJson('/api/providers?search=Soft&verified=1&location=Lagos')
            ->assertOk()->assertJsonPath('data.0.slug', $provider->slug)->assertJsonPath('meta.total', 1);
        $this->getJson('/api/providers/'.$provider->slug)
            ->assertOk()
            ->assertJsonPath('data.user.name', 'Maya Beauty')
            ->assertJsonPath('data.referral_rewards_available', false)
            ->assertJsonCount(1, 'data.services')
            ->assertJsonMissingPath('data.payment_methods.0.account_reference')
            ->assertJsonMissingPath('data.payment_methods.0.instructions');

        $provider->update([
            'loyalty_enabled' => true,
            'referral_rewards_enabled' => true,
            'loyalty_referral_points' => 25,
        ]);

        $this->getJson('/api/providers/'.$provider->slug)
            ->assertOk()
            ->assertJsonPath('data.referral_rewards_available', true);
    }

    public function test_public_provider_contact_sends_spam_protected_email(): void
    {
        Notification::fake();
        [$provider] = $this->provider('Contact Artist', true);
        $provider->update(['contact_email' => 'studio@example.test']);

        $this->postJson('/api/providers/'.$provider->slug.'/contact', [
            'name' => 'Client One',
            'email' => 'client@example.test',
            'phone' => '+2348012345678',
            'message' => 'I would like to ask about bridal makeup availability next month.',
            'submitted_at' => now()->subSeconds(10)->timestamp,
            'company_website' => '',
        ])->assertCreated();

        $this->assertDatabaseHas('contact_enquiries', [
            'provider_id' => $provider->id,
            'name' => 'Client One',
            'email' => 'client@example.test',
            'reason' => 'Provider profile enquiry',
        ]);
        Notification::assertSentOnDemand(ProviderContactEnquiryNotification::class, function ($notification, $channels, $notifiable) {
            return ($notifiable->routes['mail'] ?? null) === 'studio@example.test';
        });

        $this->postJson('/api/providers/'.$provider->slug.'/contact', [
            'name' => 'Bot',
            'email' => 'bot@example.test',
            'message' => 'This should not be accepted by the provider contact form.',
            'submitted_at' => now()->subSeconds(10)->timestamp,
            'company_website' => 'https://spam.example',
        ])->assertUnprocessable();

        $this->assertSame(1, ContactEnquiry::where('provider_id', $provider->id)->count());
    }

    public function test_customer_can_book_available_slot_and_provider_can_complete_it(): void
    {
        Notification::fake();
        [$provider, $providerUser] = $this->provider('Booked Beauty', true);
        $provider->update([
            'loyalty_enabled' => true,
            'booking_form_fields' => [
                ['label' => 'Do you have allergies?', 'type' => 'textarea', 'required' => true],
            ],
        ]);
        $service = $provider->services()->create(['name' => 'Facial', 'category' => 'Skincare', 'service_type' => 'in_person', 'price' => 20000, 'duration_minutes' => 60]);
        $date = Carbon::tomorrow();
        if ($date->dayOfWeek === 0) {
            $date->addDay();
        }
        Availability::create(['provider_id' => $provider->id, 'day_of_week' => $date->dayOfWeek, 'start_time' => '09:00', 'end_time' => '17:00']);
        $customer = User::factory()->create();

        Sanctum::actingAs($customer);
        $bookingId = $this->postJson('/api/bookings', [
            'provider_id' => $provider->id, 'service_id' => $service->id,
            'date' => $date->toDateString(), 'time' => '10:00',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.manual_payment.account_reference', 'test-'.$providerUser->id)
            ->assertJsonPath('data.manual_payment.instructions', 'Use the booking reference when paying.')
            ->json('data.id');
        $this->assertDatabaseHas('payments', ['booking_id' => $bookingId, 'amount' => 20000]);
        $this->assertSame([], Booking::find($bookingId)->custom_fields ?? []);

        Sanctum::actingAs($providerUser);
        $this->patchJson("/api/provider/bookings/{$bookingId}/status", ['status' => 'confirmed'])->assertOk();
        $this->patchJson("/api/provider/bookings/{$bookingId}/status", ['status' => 'completed'])->assertOk();
        $this->assertDatabaseHas('loyalties', ['provider_id' => $provider->id, 'customer_id' => $customer->id, 'points' => 10]);
        $this->assertDatabaseHas('crm_customers', ['provider_id' => $provider->id, 'customer_id' => $customer->id]);
    }

    public function test_guest_booking_account_creation_requires_matching_password_confirmation(): void
    {
        Notification::fake();
        [$provider] = $this->provider('Password Confirm Studio', true);
        $service = $provider->services()->create(['name' => 'Password Facial', 'category' => 'Skincare', 'service_type' => 'in_person', 'price' => 22000, 'duration_minutes' => 60]);
        $date = Carbon::tomorrow();
        if ($date->dayOfWeek === 0) {
            $date->addDay();
        }
        Availability::create(['provider_id' => $provider->id, 'day_of_week' => $date->dayOfWeek, 'start_time' => '09:00', 'end_time' => '17:00']);

        $this->postJson('/api/guest-bookings', [
            'provider_id' => $provider->id,
            'service_id' => $service->id,
            'date' => $date->toDateString(),
            'time' => '10:00',
            'payment_method' => 'manual',
            'customer' => [
                'name' => 'Password Client',
                'email' => 'password-client@example.test',
                'phone' => '+2348012345678',
                'create_account' => true,
                'password' => 'Password123',
                'password_confirmation' => 'Different123',
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('customer.password');

        $this->assertDatabaseMissing('users', ['email' => 'password-client@example.test']);
    }

    public function test_referrer_earns_loyalty_points_after_referred_booking_is_completed(): void
    {
        Notification::fake();
        [$provider, $providerUser] = $this->provider('Referral Studio', true);
        $provider->update([
            'loyalty_enabled' => true,
            'loyalty_points_per_booking' => 10,
            'referral_rewards_enabled' => true,
            'loyalty_referral_points' => 25,
        ]);
        $service = $provider->services()->create(['name' => 'Referral Facial', 'category' => 'Skincare', 'price' => 18000, 'duration_minutes' => 60]);
        $referrer = User::factory()->create();
        $newCustomer = User::factory()->create();
        Booking::create([
            'provider_id' => $provider->id,
            'customer_id' => $referrer->id,
            'service_id' => $service->id,
            'date' => now()->subWeek()->toDateString(),
            'time' => '10:00',
            'status' => 'completed',
        ]);

        $date = Carbon::tomorrow();
        if ($date->dayOfWeek === 0) {
            $date->addDay();
        }
        Availability::create(['provider_id' => $provider->id, 'day_of_week' => $date->dayOfWeek, 'start_time' => '09:00', 'end_time' => '17:00']);

        Sanctum::actingAs($newCustomer);
        $bookingId = $this->postJson('/api/bookings', [
            'provider_id' => $provider->id,
            'service_id' => $service->id,
            'date' => $date->toDateString(),
            'time' => '11:00',
            'referral_code' => "BPHQ-{$provider->id}-{$referrer->id}",
        ])->assertCreated()
            ->assertJsonPath('data.referred_by_customer_id', $referrer->id)
            ->json('data.id');

        Sanctum::actingAs($providerUser);
        $this->patchJson("/api/provider/bookings/{$bookingId}/status", ['status' => 'confirmed'])->assertOk();
        $this->patchJson("/api/provider/bookings/{$bookingId}/status", ['status' => 'completed'])->assertOk();

        $this->assertDatabaseHas('loyalties', ['provider_id' => $provider->id, 'customer_id' => $referrer->id, 'points' => 25]);
        $this->assertDatabaseHas('loyalty_transactions', ['booking_id' => $bookingId, 'points' => 25, 'reason' => 'Referral reward']);
        $this->assertDatabaseHas('bookings', ['id' => $bookingId, 'referred_by_customer_id' => $referrer->id]);
        $this->assertNotNull(Booking::find($bookingId)->referral_points_awarded_at);
    }

    public function test_booking_rejects_unavailable_or_conflicting_time(): void
    {
        [$provider] = $this->provider('Busy Artist');
        $service = $provider->services()->create(['name' => 'Makeup', 'price' => 10000, 'duration_minutes' => 60]);
        $date = Carbon::tomorrow();
        Availability::create(['provider_id' => $provider->id, 'day_of_week' => $date->dayOfWeek, 'start_time' => '09:00', 'end_time' => '12:00']);
        $customer = User::factory()->create();
        Sanctum::actingAs($customer);

        $this->postJson('/api/bookings', ['provider_id' => $provider->id, 'service_id' => $service->id, 'date' => $date->toDateString(), 'time' => '16:00'])->assertUnprocessable();
        $this->postJson('/api/bookings', ['provider_id' => $provider->id, 'service_id' => $service->id, 'date' => $date->toDateString(), 'time' => '10:00'])->assertCreated();
        $this->postJson('/api/bookings', ['provider_id' => $provider->id, 'service_id' => $service->id, 'date' => $date->toDateString(), 'time' => '10:30'])->assertConflict();
    }

    public function test_admin_can_approve_verification_and_provider_access_is_scoped(): void
    {
        Notification::fake();
        [$provider] = $this->provider('Verify Me', false);
        $verification = VerificationRequest::create(['provider_id' => $provider->id, 'portfolio_links' => ['https://example.com/work'], 'status' => 'pending']);
        $admin = User::factory()->admin()->create();

        Sanctum::actingAs($admin);
        $this->patchJson('/api/admin/verifications/'.$verification->id, ['status' => 'approved', 'admin_notes' => 'Portfolio confirmed.'])
            ->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertTrue($provider->fresh()->verified);
    }

    public function test_provider_can_manage_services_schedule_and_payment_account(): void
    {
        [$provider, $user] = $this->provider('Studio Owner', true);
        Sanctum::actingAs($user);

        $this->postJson('/api/provider/services', [
            'name' => 'Braiding', 'category' => 'Hair',
            'price' => 30000, 'duration_minutes' => 120,
        ])->assertCreated()->assertJsonPath('data.name', 'Braiding')->assertJsonPath('data.service_type', 'in_person');

        $this->putJson('/api/provider/availability', ['slots' => [
            ['day_of_week' => 1, 'start_time' => '09:00', 'end_time' => '17:00'],
            ['day_of_week' => 2, 'start_time' => '10:00', 'end_time' => '18:00'],
        ]])->assertOk()->assertJsonCount(2, 'data');

        $paymentAccountResponse = $this->putJson('/api/provider/payment-accounts', [
            'gateway' => 'paystack', 'account_name' => 'Studio Owner Ltd',
            'account_identifier' => 'ACCT_demo', 'public_key' => 'pk_test_demo', 'enabled' => true,
        ])->assertOk()
            ->assertJsonPath('data.enabled', true);
        $this->assertStringContainsString('/api/paystack/provider-webhook/', $paymentAccountResponse->json('data.webhook_url'));
        $this->assertDatabaseHas('payment_accounts', ['provider_id' => $provider->id, 'gateway' => 'paystack', 'account_identifier' => 'ACCT_demo']);
    }

    public function test_paystack_webhook_urls_are_exposed_for_admin_and_each_provider(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/payment-settings/paystack')
            ->assertOk()
            ->assertJsonPath('data.webhook_url', url('/api/paystack/webhook'));

        [$firstProvider, $firstUser] = $this->provider('First Webhook Studio', true);
        [$secondProvider, $secondUser] = $this->provider('Second Webhook Studio', true);

        Sanctum::actingAs($firstUser);
        $firstUrl = $this->putJson('/api/provider/payment-accounts', [
            'gateway' => 'paystack',
            'account_name' => 'First Webhook Studio',
            'account_identifier' => 'first-paystack',
            'public_key' => 'pk_test_first',
            'settings' => ['secret_key' => 'sk_test_first'],
            'enabled' => true,
        ])->assertOk()->json('data.webhook_url');

        Sanctum::actingAs($secondUser);
        $secondUrl = $this->putJson('/api/provider/payment-accounts', [
            'gateway' => 'paystack',
            'account_name' => 'Second Webhook Studio',
            'account_identifier' => 'second-paystack',
            'public_key' => 'pk_test_second',
            'settings' => ['secret_key' => 'sk_test_second'],
            'enabled' => true,
        ])->assertOk()->json('data.webhook_url');

        $this->assertNotSame($firstUrl, $secondUrl);
        $this->assertStringContainsString('/api/paystack/provider-webhook/'.$firstProvider->paymentAccounts()->where('gateway', 'paystack')->value('id').'/', $firstUrl);
        $this->assertStringContainsString('/api/paystack/provider-webhook/'.$secondProvider->paymentAccounts()->where('gateway', 'paystack')->value('id').'/', $secondUrl);
    }

    public function test_provider_analytics_reports_customer_retention(): void
    {
        [$provider, $user] = $this->provider('Retention Studio', true);
        $service = $provider->services()->create(['name' => 'Retention Facial', 'price' => 15000, 'duration_minutes' => 60]);
        $returningCustomer = User::factory()->create();
        $samePeriodRepeatCustomer = User::factory()->create();
        $newCustomer = User::factory()->create();

        Booking::create([
            'provider_id' => $provider->id,
            'customer_id' => $returningCustomer->id,
            'service_id' => $service->id,
            'date' => now()->subMonth()->toDateString(),
            'time' => '10:00',
            'status' => 'completed',
            'created_at' => now()->subMonth(),
            'updated_at' => now()->subMonth(),
        ]);

        foreach ([$returningCustomer, $samePeriodRepeatCustomer, $samePeriodRepeatCustomer, $newCustomer] as $index => $customer) {
            Booking::create([
                'provider_id' => $provider->id,
                'customer_id' => $customer->id,
                'service_id' => $service->id,
                'date' => now()->addDays($index + 1)->toDateString(),
                'time' => sprintf('1%d:00', $index),
                'status' => 'confirmed',
                'created_at' => now()->subDays($index),
                'updated_at' => now()->subDays($index),
            ]);
        }

        Sanctum::actingAs($user);
        $this->getJson('/api/provider/analytics?period=month')
            ->assertOk()
            ->assertJsonPath('data.period_customers', 3)
            ->assertJsonPath('data.returning_customers', 2)
            ->assertJsonPath('data.customer_retention_rate', 66.7);
    }

    public function test_customer_saved_provider_actions_are_idempotent(): void
    {
        [$provider] = $this->provider('Saveable Pro', true);
        $customer = User::factory()->create();
        Sanctum::actingAs($customer);

        $this->postJson('/api/customer/saved-providers/'.$provider->id)->assertCreated();
        $this->postJson('/api/customer/saved-providers/'.$provider->id)->assertCreated();
        $this->assertDatabaseCount('saved_providers', 1);
        $this->deleteJson('/api/customer/saved-providers/'.$provider->id)->assertOk();
        $this->assertDatabaseCount('saved_providers', 0);
    }

    public function test_admin_content_status_alias_publishes_real_content(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $articleId = $this->postJson('/api/admin/news', [
            'title' => 'Industry update', 'content' => 'A detailed industry update.', 'status' => 'published',
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('news', ['id' => $articleId]);
        $this->getJson('/api/news')->assertOk()->assertJsonPath('data.0.id', $articleId);
    }

    public function test_community_content_uses_secure_seo_slug_permalinks(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $postId = $this->postJson('/api/admin/community-posts', [
            'title' => 'A Community Win!',
            'slug' => 'A Community Win! <script>',
            'content' => '<p>A useful community story.</p>',
            'type' => 'business_win',
            'status' => 'published',
        ])->assertCreated()
            ->assertJsonPath('data.slug', 'a-community-win-script')
            ->json('data.id');

        $this->postJson('/api/admin/community-posts', [
            'title' => 'Another Community Win',
            'slug' => 'a-community-win-script',
            'content' => '<p>Another useful community story.</p>',
            'type' => 'story',
            'status' => 'published',
        ])->assertCreated()
            ->assertJsonPath('data.slug', 'a-community-win-script-1');

        $this->getJson('/api/community-posts/a-community-win-script')
            ->assertOk()
            ->assertJsonPath('data.id', $postId);

        $this->getJson('/api/community-posts/'.$postId)
            ->assertOk()
            ->assertJsonPath('data.slug', 'a-community-win-script');

        $this->get('/community/'.$postId)
            ->assertRedirect('/community/a-community-win-script');

        $this->assertDatabaseHas('community_posts', [
            'id' => $postId,
            'slug' => 'a-community-win-script',
        ]);
    }

    public function test_authenticated_members_can_interact_with_community_posts(): void
    {
        $post = CommunityPost::create([
            'title' => 'Community Interaction Thread',
            'slug' => 'community-interaction-thread',
            'content' => '<p>Discuss useful community workflows.</p>',
            'type' => 'discussion',
            'topic' => 'Help',
            'group_name' => 'New providers',
            'published_at' => now(),
        ]);
        $member = User::factory()->create();
        Sanctum::actingAs($member);

        $this->postJson("/api/community-posts/{$post->id}/reactions", ['type' => 'helpful'])
            ->assertOk()
            ->assertJsonPath('data.viewer_reaction', 'helpful')
            ->assertJsonPath('data.reaction_count', 1);

        $commentId = $this->postJson("/api/community-posts/{$post->id}/comments", [
            'body' => 'This is helpful for @newprovider.',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/community-posts/{$post->id}/comments", [
            'body' => 'Replying to keep the discussion active.',
            'parent_id' => $commentId,
        ])->assertCreated();

        $this->postJson("/api/community-posts/{$post->id}/shares", ['channel' => 'copy_link'])->assertOk();
        $this->postJson("/api/community-posts/{$post->id}/reports", ['reason' => 'other', 'details' => 'Needs moderation review.'])->assertOk();

        $this->getJson("/api/community-posts/{$post->slug}")
            ->assertOk()
            ->assertJsonPath('data.topic', 'Help')
            ->assertJsonPath('data.group_name', 'New providers')
            ->assertJsonPath('data.comment_count', 2)
            ->assertJsonPath('data.share_count', 1)
            ->assertJsonPath('data.report_count', 1)
            ->assertJsonPath('data.comments.0.replies.0.body', 'Replying to keep the discussion active.');
    }

    public function test_homepage_limits_community_posts_to_three(): void
    {
        foreach (range(1, 5) as $index) {
            CommunityPost::create([
                'title' => "Homepage Community {$index}",
                'content' => '<p>Approved community content for the homepage.</p>',
                'type' => 'community',
                'topic' => 'General',
                'published_at' => now()->subMinutes($index),
            ]);
        }

        $this->getJson('/api/home')
            ->assertOk()
            ->assertJsonCount(3, 'data.community');
    }

    public function test_paid_provider_can_submit_community_post_for_admin_approval(): void
    {
        Notification::fake();
        $admin = User::factory()->admin()->create();
        [$profile, $providerUser] = $this->provider('Community Provider', true);
        Sanctum::actingAs($providerUser);

        $postId = $this->postJson('/api/provider/community-posts', [
            'title' => 'How I prepare clients before a beauty appointment',
            'content' => str_repeat('This provider submission shares useful client care, booking preparation, community learning, and professional standards. ', 3),
            'type' => 'help',
            'topic' => 'Client experience',
            'group_name' => 'Service providers',
            'mentions' => ['beautyprohq'],
        ])->assertCreated()
            ->assertJsonPath('data.status', 'pending approval')
            ->json('data.id');

        $this->assertDatabaseHas('community_posts', [
            'id' => $postId,
            'provider_id' => $profile->id,
            'published_at' => null,
        ]);

        $this->getJson('/api/community-posts')->assertOk()->assertJsonMissing(['id' => $postId]);

        Sanctum::actingAs($admin);
        $this->putJson("/api/admin/community-posts/{$postId}", ['status' => 'published'])
            ->assertOk()
            ->assertJsonPath('data.id', $postId);

        $this->getJson('/api/community-posts')
            ->assertOk()
            ->assertJsonFragment(['id' => $postId]);
    }

    public function test_admin_subscribers_include_names_and_are_paginated(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        foreach (range(1, 25) as $index) {
            NewsletterSubscriber::create([
                'name' => "Subscriber {$index}",
                'email' => "subscriber{$index}@example.test",
                'subscribed_at' => now()->subMinutes($index),
            ]);
        }

        $this->getJson('/api/admin/waitlist?per_page=10&page=2')
            ->assertOk()
            ->assertJsonPath('data.pagination.current_page', 2)
            ->assertJsonPath('data.pagination.per_page', 10)
            ->assertJsonPath('data.pagination.total', 25)
            ->assertJsonPath('data.subscribers.0.name', 'Subscriber 11');

        $this->getJson('/api/admin/waitlist?search=Subscriber%2025')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 1)
            ->assertJsonPath('data.subscribers.0.email', 'subscriber25@example.test');
    }

    public function test_admin_can_update_newsletter_subscribers(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $subscriber = NewsletterSubscriber::create([
            'name' => 'Old Name',
            'email' => 'old@example.test',
            'subscribed_at' => now()->subDay(),
        ]);
        NewsletterSubscriber::create([
            'name' => 'Other Reader',
            'email' => 'other@example.test',
            'subscribed_at' => now()->subDay(),
        ]);

        $this->patchJson("/api/admin/subscribers/{$subscriber->id}", [
            'name' => 'Updated Reader',
            'email' => 'updated@example.test',
            'status' => 'unsubscribed',
        ])->assertOk()
            ->assertJsonPath('data.name', 'Updated Reader')
            ->assertJsonPath('data.email', 'updated@example.test')
            ->assertJsonPath('data.unsubscribed_at', fn ($value) => filled($value));

        $this->assertDatabaseHas('newsletter_subscribers', [
            'id' => $subscriber->id,
            'name' => 'Updated Reader',
            'email' => 'updated@example.test',
        ]);
        $this->assertNotNull($subscriber->fresh()->unsubscribed_at);

        $this->patchJson("/api/admin/subscribers/{$subscriber->id}", [
            'name' => 'Updated Reader',
            'email' => 'updated@example.test',
            'status' => 'active',
        ])->assertOk()
            ->assertJsonPath('data.unsubscribed_at', null);

        $this->patchJson("/api/admin/subscribers/{$subscriber->id}", [
            'name' => 'Duplicate Reader',
            'email' => 'other@example.test',
            'status' => 'active',
        ])->assertUnprocessable();
    }

    public function test_admin_can_choose_to_email_subscribers_when_news_is_published(): void
    {
        Notification::fake();
        Sanctum::actingAs(User::factory()->admin()->create());
        NewsletterSubscriber::create(['name' => 'Active One', 'email' => 'active1@example.test', 'subscribed_at' => now()]);
        NewsletterSubscriber::create(['name' => 'Active Two', 'email' => 'active2@example.test', 'subscribed_at' => now()]);
        NewsletterSubscriber::create(['name' => 'Unsubscribed', 'email' => 'left@example.test', 'subscribed_at' => now(), 'unsubscribed_at' => now()]);

        $newsId = $this->postJson('/api/admin/news', [
            'title' => 'Subscriber Update',
            'content' => '<p>A useful update for subscribers.</p>',
            'status' => 'published',
            'notify_subscribers' => true,
        ])->assertCreated()
            ->assertJsonPath('data.newsletter_notified_count', 2)
            ->json('data.id');

        $this->assertDatabaseHas('news', ['id' => $newsId, 'newsletter_notified_count' => 2]);
        $this->assertNotNull(News::find($newsId)->newsletter_notified_at);
    }

    public function test_admin_can_choose_to_email_subscribers_when_opportunity_is_published(): void
    {
        Notification::fake();
        Sanctum::actingAs(User::factory()->admin()->create());
        NewsletterSubscriber::create(['name' => 'Active One', 'email' => 'active1@example.test', 'subscribed_at' => now()]);
        NewsletterSubscriber::create(['name' => 'Unsubscribed', 'email' => 'left@example.test', 'subscribed_at' => now(), 'unsubscribed_at' => now()]);

        $opportunityId = $this->postJson('/api/admin/opportunities', [
            'title' => 'Beauty Training Call',
            'type' => 'training',
            'description' => '<p>A useful opportunity for beauty professionals.</p>',
            'contact_info' => ['email' => 'opportunities@example.test'],
            'location' => 'Lagos',
            'deadline' => now()->addWeek()->toDateString(),
            'status' => 'published',
            'notify_subscribers' => true,
        ])->assertCreated()
            ->assertJsonPath('data.newsletter_notified_count', 1)
            ->json('data.id');

        $opportunity = Opportunity::findOrFail($opportunityId);
        $this->assertSame(1, $opportunity->newsletter_notified_count);
        $this->assertNotNull($opportunity->newsletter_notified_at);
    }

    public function test_admin_can_paginate_and_delete_media_files(): void
    {
        Storage::fake('public');
        Sanctum::actingAs(User::factory()->admin()->create());

        Storage::disk('public')->put('uploads/one.jpg', 'one');
        Storage::disk('public')->put('uploads/two.jpg', 'two');

        $this->getJson('/api/admin/media?per_page=1')
            ->assertOk()
            ->assertJsonPath('meta.total', 2)
            ->assertJsonPath('meta.per_page', 1)
            ->assertJsonCount(1, 'data');

        $this->deleteJson('/api/admin/media', ['path' => 'uploads/one.jpg'])
            ->assertOk();

        Storage::disk('public')->assertMissing('uploads/one.jpg');
        Storage::disk('public')->assertExists('uploads/two.jpg');

        $this->deleteJson('/api/admin/media', ['path' => '../.env'])
            ->assertUnprocessable();
    }

    public function test_admin_session_can_load_main_dashboard_sections(): void
    {
        $admin = User::factory()->admin()->create(['password' => 'Password123']);

        $this->withSession(['_token' => 'admin-session-csrf-token'])
            ->withHeader('X-CSRF-TOKEN', 'admin-session-csrf-token')
            ->withHeader('Referer', rtrim(config('app.url'), '/').'/login');

        $this->postJson('/api/auth/login', [
            'email' => $admin->email,
            'password' => 'Password123',
        ])->assertOk();

        foreach ([
            '/api/auth/me',
            '/api/admin/dashboard',
            '/api/admin/activity',
            '/api/admin/waitlist',
            '/api/admin/users',
            '/api/admin/directory',
            '/api/admin/provider-categories',
            '/api/admin/verifications',
            '/api/admin/subscriptions',
            '/api/admin/subscription-plans',
            '/api/admin/news',
            '/api/admin/events',
            '/api/admin/community-posts',
            '/api/admin/media',
            '/api/admin/opportunities',
            '/api/admin/announcements',
            '/api/admin/settings/features',
            '/api/admin/settings/branding',
            '/api/admin/settings/currencies',
            '/api/admin/settings/twilio',
            '/api/admin/settings/smtp',
            '/api/admin/settings/mailchimp',
            '/api/admin/payment-settings/gateway',
            '/api/admin/payment-settings/paystack',
            '/api/admin/payment-settings/stripe',
            '/api/admin/demo-data',
        ] as $endpoint) {
            $this->getJson($endpoint)->assertOk($endpoint);
        }
    }

    public function test_admin_can_use_cpanel_php_mail_for_platform_email(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->putJson('/api/admin/settings/smtp', [
            'enabled' => true,
            'mailer' => 'php_mail',
            'from_address' => 'hello@beautyprohq.com',
            'from_name' => 'BeautyPro HQ',
        ])->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.mailer', 'php_mail')
            ->assertJsonPath('data.configured', true);

        $this->assertSame('1', AppSetting::getValue('smtp.enabled'));
        $this->assertSame('php_mail', AppSetting::getValue('smtp.mailer'));
    }

    public function test_requested_subscriber_email_is_sent_when_scheduled_content_becomes_due(): void
    {
        Notification::fake();
        Sanctum::actingAs(User::factory()->admin()->create());
        NewsletterSubscriber::create(['name' => 'Scheduled Reader', 'email' => 'reader@example.test', 'subscribed_at' => now()]);

        $newsId = $this->postJson('/api/admin/news', [
            'title' => 'Scheduled Subscriber Update',
            'content' => '<p>Send this later.</p>',
            'status' => 'published',
            'published_at' => now()->addHour()->toDateTimeString(),
            'notify_subscribers' => true,
        ])->assertCreated()
            ->assertJsonPath('data.newsletter_notified_at', null)
            ->json('data.id');

        $news = News::findOrFail($newsId);
        $this->assertNotNull($news->newsletter_notify_requested_at);
        $news->update(['published_at' => now()->subMinute()]);

        $result = app(ContentNewsletterService::class)->sendDue();

        $this->assertSame(1, $result['content']);
        $this->assertSame(1, $result['sent']);
        $this->assertDatabaseHas('news', ['id' => $newsId, 'newsletter_notified_count' => 1]);
    }

    private function provider(string $name, bool $verified = false, string $location = 'Abuja'): array
    {
        $user = User::factory()->provider()->create(['name' => $name]);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => str($name)->slug().'-'.$user->id,
            'profession' => 'Beauty Professional',
            'location' => $location,
            'verified' => $verified,
        ]);

        $plan = SubscriptionPlan::where('key', 'paid')->firstOrFail();
        Subscription::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'plan' => $plan->key,
            'status' => 'active',
            'amount' => $plan->price,
            'currency' => $plan->currency,
            'starts_at' => now(),
            'renews_at' => now()->addMonth(),
        ]);
        $profile->paymentAccounts()->create([
            'gateway' => 'manual',
            'account_name' => $name,
            'account_reference' => 'test-'.$user->id,
            'account_identifier' => 'test-'.$user->id,
            'settings' => ['instructions' => 'Use the booking reference when paying.'],
            'is_connected' => true,
            'enabled' => true,
        ]);

        return [$profile, $user];
    }

    private function tinyPngUpload(string $name): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'bphq-png-');
        file_put_contents($path, base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l6O3GAAAAABJRU5ErkJggg=='));

        return new UploadedFile($path, $name, 'image/png', null, true);
    }

    private function postPaystackWebhook(array $payload): \Illuminate\Testing\TestResponse
    {
        $content = json_encode($payload);

        return $this->call('POST', '/api/paystack/webhook', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_PAYSTACK_SIGNATURE' => hash_hmac('sha512', $content, 'sk_test_bphq'),
        ], $content);
    }
}
