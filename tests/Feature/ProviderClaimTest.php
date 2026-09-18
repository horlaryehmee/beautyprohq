<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\User;
use App\Notifications\ProviderClaimNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class ProviderClaimTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost:5173');
    }

    private function importedProfile(string $sourceEmail, string $loginEmail, int $sourceId): ProviderProfile
    {
        $user = User::factory()->provider()->unverified()->create(['email' => $loginEmail]);

        return $user->providerProfile()->create([
            'slug' => 'imported-'.$sourceId,
            'profession' => 'Makeup Artist',
            'wordpress_listing_id' => $sourceId,
            'imported_email' => $sourceEmail,
            'is_listed' => true,
            'account_approved_at' => now(),
        ]);
    }

    public function test_claim_request_is_private_and_sends_a_link_only_to_the_source_email(): void
    {
        Notification::fake();
        $profile = $this->importedProfile('owner@example.test', 'owner@example.test', 123);

        $this->postJson('/api/auth/claim/request', ['email' => 'unknown@example.test'])
            ->assertOk();
        Notification::assertNothingSent();

        $this->postJson('/api/auth/claim/request', ['email' => 'OWNER@EXAMPLE.TEST'])
            ->assertOk();
        Notification::assertSentOnDemand(ProviderClaimNotification::class, function ($notification, $channels, $notifiable) use ($profile): bool {
            return $notification->providerId === $profile->id
                && $notifiable->routes['mail'] === 'owner@example.test';
        });
        $this->assertNotNull($profile->fresh()->claim_token_hash);
    }

    public function test_source_email_owner_can_claim_and_open_provider_dashboard_only_once(): void
    {
        $profile = $this->importedProfile('owner@example.test', 'owner@example.test', 123);
        $token = str_repeat('a', 64);
        $profile->update(['claim_token_hash' => hash('sha256', $token), 'claim_expires_at' => now()->addHour()]);

        $payload = [
            'listing' => $profile->id,
            'token' => $token,
            'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123',
            'accept_terms' => true,
        ];
        $this->postJson('/api/auth/claim/complete', $payload)
            ->assertOk()->assertJsonPath('data.redirect', '/provider');

        $profile->refresh();
        $this->assertNotNull($profile->claimed_at);
        $this->assertNotNull($profile->onboarding_completed_at);
        $this->assertNotNull($profile->account_approved_at);
        $this->assertNotNull($profile->user->email_verified_at);
        $this->assertTrue(Hash::check('SecurePass123', $profile->user->password));
        $this->getJson('/api/provider/dashboard')->assertOk();
        $this->postJson('/api/auth/claim/complete', $payload)->assertUnprocessable();
    }

    public function test_duplicate_email_listing_requires_a_unique_verified_login(): void
    {
        Notification::fake();
        $this->importedProfile('shared@example.test', 'shared@example.test', 123);
        $profile = $this->importedProfile('shared@example.test', 'wp-listing-124@import.beautyprohq.invalid', 124);
        $token = str_repeat('b', 64);
        $profile->update(['claim_token_hash' => hash('sha256', $token), 'claim_expires_at' => now()->addHour()]);
        $payload = [
            'listing' => $profile->id,
            'token' => $token,
            'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123',
            'accept_terms' => true,
        ];

        $this->postJson('/api/auth/claim/complete', $payload)
            ->assertUnprocessable()->assertJsonValidationErrors('login_email');
        $this->postJson('/api/auth/claim/complete', [...$payload, 'login_email' => 'shared@example.test'])
            ->assertUnprocessable()->assertJsonValidationErrors('login_email');
        $this->postJson('/api/auth/claim/complete', [...$payload, 'login_email' => 'second@example.test'])
            ->assertOk()->assertJsonPath('data.redirect', '/verify-email');

        $this->assertSame('second@example.test', $profile->fresh()->user->email);
        $this->assertNull($profile->fresh()->user->email_verified_at);
        $this->getJson('/api/provider/dashboard')->assertForbidden();
    }

    public function test_expired_claim_link_cannot_change_credentials(): void
    {
        $profile = $this->importedProfile('owner@example.test', 'owner@example.test', 123);
        $token = str_repeat('c', 64);
        $profile->update(['claim_token_hash' => hash('sha256', $token), 'claim_expires_at' => now()->subMinute()]);

        $this->postJson('/api/auth/claim/complete', [
            'listing' => $profile->id,
            'token' => $token,
            'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123',
            'accept_terms' => true,
        ])->assertUnprocessable()->assertJsonValidationErrors('token');
        $this->assertNull($profile->fresh()->claimed_at);
    }
}
