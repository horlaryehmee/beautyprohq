<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureRecentAdminAuthentication;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GoogleAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_fully_configure_google_auth_without_exposing_the_secret(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        Sanctum::actingAs(User::factory()->admin()->create());

        $response = $this->putJson('/api/admin/settings/google-auth', [
            'enabled' => true,
            'client_id' => 'google-client.apps.googleusercontent.com',
            'client_secret' => 'google-client-secret',
        ])->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonPath('data.configured', true)
            ->assertJsonPath('data.client_secret_configured', true)
            ->assertJsonMissing(['client_secret' => 'google-client-secret']);

        $this->assertSame('google-client-secret', AppSetting::getValue('google.client_secret'));
        $this->assertNotSame('google-client-secret', AppSetting::where('key', 'google.client_secret')->value('value'));
        $this->assertStringEndsWith('/auth/google/callback', $response->json('data.redirect_uri'));
    }

    public function test_customer_can_register_with_google_and_is_immediately_verified(): void
    {
        $this->enableGoogle();

        $redirect = $this->get('/auth/google/redirect?intent=register&role=customer&plan=free')
            ->assertRedirect();
        $this->assertStringStartsWith('https://accounts.google.com/o/oauth2/v2/auth?', $redirect->headers->get('Location'));
        $pending = session('google_oauth');
        $this->assertNotEmpty($pending['state']);
        $this->assertNotEmpty($pending['code_verifier']);

        $this->fakeGoogleProfile('google-customer-123', 'google.customer@example.com', 'Google Customer');

        $this->get('/auth/google/callback?'.http_build_query(['state' => $pending['state'], 'code' => 'customer-code']))
            ->assertRedirect('/customer');

        $user = User::where('email', 'google.customer@example.com')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertSame('customer', $user->role);
        $this->assertSame('google-customer-123', $user->google_id);
        $this->assertNotNull($user->email_verified_at);
    }

    public function test_provider_google_registration_creates_profile_and_selected_plan(): void
    {
        $this->enableGoogle();
        $this->get('/auth/google/redirect?intent=register&role=provider&plan=paid')->assertRedirect();
        $pending = session('google_oauth');
        $this->fakeGoogleProfile('google-provider-123', 'google.provider@example.com', 'Google Provider');

        $this->get('/auth/google/callback?'.http_build_query(['state' => $pending['state'], 'code' => 'provider-code']))
            ->assertRedirect('/provider/onboarding');

        $user = User::where('email', 'google.provider@example.com')->firstOrFail();
        $this->assertSame('provider', $user->role);
        $this->assertNotNull($user->providerProfile);
        $this->assertDatabaseHas('subscriptions', [
            'user_id' => $user->id,
            'plan' => 'paid',
            'status' => 'expired',
        ]);
    }

    public function test_google_login_links_an_existing_account_without_changing_its_role(): void
    {
        $this->enableGoogle();
        $existing = User::factory()->provider()->create(['email' => 'existing@example.com']);
        $this->get('/auth/google/redirect?intent=login')->assertRedirect();
        $pending = session('google_oauth');
        $this->fakeGoogleProfile('existing-google-id', 'existing@example.com', 'Different Google Name');

        $this->get('/auth/google/callback?'.http_build_query(['state' => $pending['state'], 'code' => 'login-code']))
            ->assertRedirect('/provider');

        $this->assertAuthenticatedAs($existing);
        $this->assertSame('provider', $existing->fresh()->role);
        $this->assertSame('existing-google-id', $existing->fresh()->google_id);
    }

    public function test_google_callback_rejects_an_invalid_state_without_contacting_google(): void
    {
        $this->enableGoogle();
        Http::fake();
        $this->get('/auth/google/redirect?intent=register&role=customer')->assertRedirect();

        $this->get('/auth/google/callback?state=wrong-state&code=code')
            ->assertRedirectContains('/register?google_error=');

        Http::assertNothingSent();
        $this->assertGuest();
    }

    public function test_google_login_still_requires_the_users_configured_two_factor_challenge(): void
    {
        $this->enableGoogle();
        User::factory()->create([
            'email' => 'secured@example.com',
            'two_factor_enabled' => true,
            'two_factor_method' => 'totp',
            'two_factor_totp_secret' => 'JBSWY3DPEHPK3PXP',
            'two_factor_confirmed_at' => now(),
        ]);
        $this->get('/auth/google/redirect?intent=login')->assertRedirect();
        $pending = session('google_oauth');
        $this->fakeGoogleProfile('secured-google-id', 'secured@example.com', 'Secured Customer');

        $this->get('/auth/google/callback?'.http_build_query(['state' => $pending['state'], 'code' => 'secured-code']))
            ->assertRedirectContains('/login?google_2fa=1');

        $this->assertGuest();
        $this->assertSame(User::where('email', 'secured@example.com')->value('id'), session('google_2fa.user_id'));
    }

    private function enableGoogle(): void
    {
        AppSetting::setValue('google.client_id', 'google-client.apps.googleusercontent.com');
        AppSetting::setValue('google.client_secret', 'google-client-secret', true);
        AppSetting::setValue('google.enabled', '1');
    }

    private function fakeGoogleProfile(string $id, string $email, string $name): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'google-access-token']),
            'https://openidconnect.googleapis.com/v1/userinfo' => Http::response([
                'sub' => $id,
                'email' => $email,
                'email_verified' => true,
                'name' => $name,
            ]),
        ]);
    }
}
