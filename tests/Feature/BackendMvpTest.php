<?php

namespace Tests\Feature;

use App\Models\Availability;
use App\Models\Booking;
use App\Models\CommunityPost;
use App\Models\ContactEnquiry;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Opportunity;
use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\VerificationRequest;
use App\Notifications\BookingStatusNotification;
use App\Notifications\ProviderContactEnquiryNotification;
use App\Services\ContentNewsletterService;
use Carbon\Carbon;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Storage;
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

        $this->putJson('/api/provider/payment-accounts', [
            'gateway' => 'paystack', 'account_name' => 'Studio Owner Ltd',
            'account_identifier' => 'ACCT_demo', 'public_key' => 'pk_test_demo', 'enabled' => true,
        ])->assertOk()->assertJsonPath('data.enabled', true);
        $this->assertDatabaseHas('payment_accounts', ['provider_id' => $provider->id, 'gateway' => 'paystack', 'account_identifier' => 'ACCT_demo']);
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
}
