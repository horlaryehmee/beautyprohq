<?php

namespace Tests\Feature;

use App\Models\CommunityPost;
use App\Models\ProviderProfile;
use App\Models\Service;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AccountDeletionTest extends TestCase
{
    use RefreshDatabase;

    public function test_customer_can_permanently_delete_their_account(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('account-deletion-test')->plainTextToken;

        $this->withToken($token)->deleteJson('/api/auth/account', [
            'password' => 'password',
            'confirmation' => 'DELETE',
        ])
            ->assertOk()
            ->assertJsonPath('message', 'Your account has been permanently deleted.');

        $this->assertDatabaseMissing('users', ['id' => $user->id]);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
    }

    public function test_password_and_explicit_confirmation_are_required(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->deleteJson('/api/auth/account', [
                'password' => 'not-the-password',
                'confirmation' => 'DELETE',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'The password is incorrect.');

        $this->actingAs($user)
            ->deleteJson('/api/auth/account', [
                'password' => 'password',
                'confirmation' => 'delete',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('confirmation');

        $this->assertDatabaseHas('users', ['id' => $user->id]);
    }

    public function test_provider_profile_and_owned_content_are_deleted(): void
    {
        $user = User::factory()->provider()->create();
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'deleting-provider',
            'profession' => 'Hair stylist',
        ]);
        $service = Service::create([
            'provider_id' => $profile->id,
            'name' => 'Silk press',
            'price' => 25000,
        ]);
        $post = CommunityPost::create([
            'provider_id' => $profile->id,
            'title' => 'Provider story',
            'content' => 'Account-owned content.',
            'published_at' => now(),
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/auth/account', [
                'password' => 'password',
                'confirmation' => 'DELETE',
            ])
            ->assertOk();

        $this->assertDatabaseMissing('provider_profiles', ['id' => $profile->id]);
        $this->assertDatabaseMissing('services', ['id' => $service->id]);
        $this->assertDatabaseMissing('community_posts', ['id' => $post->id]);
    }

    public function test_active_paystack_renewal_is_stopped_before_provider_deletion(): void
    {
        config(['services.paystack.secret_key' => 'test-secret']);
        Http::fake([
            'https://api.paystack.co/subscription/disable' => Http::response(['status' => true]),
        ]);

        $user = User::factory()->provider()->create();
        ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'subscribed-provider',
            'profession' => 'Nail artist',
        ]);
        Subscription::create([
            'user_id' => $user->id,
            'plan' => 'paid',
            'status' => 'active',
            'amount' => 15000,
            'currency' => 'NGN',
            'starts_at' => now(),
            'renews_at' => now()->addMonth(),
            'metadata' => [
                'gateway' => 'paystack',
                'paystack_subscription_code' => 'SUB_example',
                'paystack_email_token' => 'email-token',
            ],
        ]);

        $this->actingAs($user)
            ->deleteJson('/api/auth/account', [
                'password' => 'password',
                'confirmation' => 'DELETE',
            ])
            ->assertOk();

        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/subscription/disable'
            && $request['code'] === 'SUB_example'
            && $request['token'] === 'email-token');
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }

    public function test_admin_cannot_use_self_service_account_deletion(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->deleteJson('/api/auth/account', [
                'password' => 'password',
                'confirmation' => 'DELETE',
            ])
            ->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }
}
