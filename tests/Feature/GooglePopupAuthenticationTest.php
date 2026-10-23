<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureRecentAdminAuthentication;
use App\Models\AppSetting;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class GooglePopupAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    private static ?\OpenSSLAsymmetricKey $key = null;

    protected function setUp(): void
    {
        parent::setUp();
        AppSetting::setValue('google.enabled', '1');
        AppSetting::setValue('google.client_id', 'popup-client.apps.googleusercontent.com');
        AppSetting::setValue('google.client_secret', 'existing-secret', true);
        AppSetting::setValue('google.popup_enabled', '1');
        self::$key ??= openssl_pkey_new([
            'private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA,
            'config' => base_path('tests/Fixtures/openssl.cnf'),
        ]);
        $details = openssl_pkey_get_details(self::$key);
        Http::preventStrayRequests();
        Http::fake(['https://www.googleapis.com/oauth2/v3/certs' => Http::response(['keys' => [[
            'kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => 'test-key',
            'n' => JWT::urlsafeB64Encode($details['rsa']['n']),
            'e' => JWT::urlsafeB64Encode($details['rsa']['e']),
        ]]], 200, ['Cache-Control' => 'public, max-age=3600'])]);
    }

    private function start(): string
    {
        return $this->postJson('/api/auth/google/popup/start')->assertOk()
            ->assertJsonPath('data.client_id', 'popup-client.apps.googleusercontent.com')->json('data.nonce');
    }

    private function token(string $nonce, array $overrides = []): string
    {
        return JWT::encode(array_replace([
            'iss' => 'https://accounts.google.com', 'aud' => 'popup-client.apps.googleusercontent.com',
            'iat' => time() - 10, 'exp' => time() + 3600, 'sub' => 'google-popup-user',
            'email' => 'popup@example.com', 'email_verified' => true, 'name' => 'Popup User', 'nonce' => $nonce,
        ], $overrides), self::$key, 'RS256', 'test-key');
    }

    public function test_popup_registers_customer_and_preserves_booking_destination(): void
    {
        $token = $this->token($this->start());
        $this->postJson('/api/auth/google/popup', [
            'credential' => $token, 'intent' => 'register', 'role' => 'customer', 'redirect' => '/providers/studio?book=1',
        ])->assertOk()->assertJsonPath('data.redirect', url('/providers/studio?book=1'));
        $user = User::where('email', 'popup@example.com')->firstOrFail();
        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->email_verified_at);
        $this->assertSame('google-popup-user', $user->google_id);
        $this->postJson('/api/auth/google/popup', ['credential' => $token, 'intent' => 'login'])->assertUnprocessable();
        Http::assertSentCount(1);
    }

    public function test_existing_provider_login_preserves_role_and_links_identity(): void
    {
        $user = User::factory()->provider()->create(['email' => 'popup@example.com']);
        $this->postJson('/api/auth/google/popup', ['credential' => $this->token($this->start()), 'intent' => 'login'])
            ->assertOk()->assertJsonPath('data.redirect', url('/provider'));
        $this->assertAuthenticatedAs($user);
        $this->assertSame('provider', $user->fresh()->role);
        $this->assertSame('google-popup-user', $user->fresh()->google_id);
    }

    public function test_two_factor_is_still_required(): void
    {
        $user = User::factory()->create([
            'email' => 'popup@example.com', 'two_factor_enabled' => true, 'two_factor_method' => 'totp',
            'two_factor_totp_secret' => 'JBSWY3DPEHPK3PXP', 'two_factor_confirmed_at' => now(),
        ]);
        $result = $this->postJson('/api/auth/google/popup', ['credential' => $this->token($this->start()), 'intent' => 'login'])->assertOk();
        $this->assertStringContainsString('google_2fa=1', $result->json('data.redirect'));
        $this->assertGuest();
        $this->assertSame($user->id, session('google_2fa.user_id'));
    }

    public function test_provider_registration_provisions_profile_and_paid_plan(): void
    {
        $this->postJson('/api/auth/google/popup', [
            'credential' => $this->token($this->start()), 'intent' => 'register', 'role' => 'provider', 'plan' => 'paid',
        ])->assertOk()->assertJsonPath('data.redirect', url('/provider/onboarding'));
        $user = User::where('email', 'popup@example.com')->firstOrFail();
        $this->assertNotNull($user->providerProfile);
        $this->assertDatabaseHas('subscriptions', ['user_id' => $user->id, 'plan' => 'paid', 'status' => 'expired']);
    }

    #[DataProvider('invalidClaims')]
    public function test_invalid_signed_claims_are_rejected(array $claims): void
    {
        $this->postJson('/api/auth/google/popup', [
            'credential' => $this->token($this->start(), $claims), 'intent' => 'register', 'role' => 'customer',
        ])->assertUnprocessable()->assertJsonValidationErrors('credential');
        $this->assertGuest();
        $this->assertDatabaseMissing('users', ['email' => 'popup@example.com']);
    }

    public static function invalidClaims(): array
    {
        return [
            'audience' => [['aud' => 'another-client']], 'issuer' => [['iss' => 'https://attacker.example']],
            'nonce' => [['nonce' => 'another-browser']], 'expired' => [['exp' => 1]],
            'missing expiration' => [['exp' => null]], 'unverified email' => [['email_verified' => false]],
            'authorized party' => [['azp' => 'another-client']], 'missing subject' => [['sub' => '']],
        ];
    }

    public function test_bad_signature_is_rejected(): void
    {
        $parts = explode('.', $this->token($this->start()));
        $parts[2] = JWT::urlsafeB64Encode(str_repeat('x', 256));
        $this->postJson('/api/auth/google/popup', ['credential' => implode('.', $parts), 'intent' => 'login'])
            ->assertUnprocessable()->assertJsonValidationErrors('credential');
        $this->assertGuest();
    }

    public function test_missing_expired_and_previously_consumed_sessions_are_rejected(): void
    {
        $token = $this->token('nonce');
        $payload = ['credential' => $token, 'intent' => 'login'];
        $this->postJson('/api/auth/google/popup', $payload)->assertUnprocessable();
        $this->withSession(['google_popup' => ['nonce' => 'nonce', 'started_at' => now()->subMinutes(11)->timestamp]])
            ->postJson('/api/auth/google/popup', $payload)->assertUnprocessable();
        Http::assertNothingSent();
        Cache::put('google_popup_used:'.hash('sha256', 'nonce'), true, 600);
        $this->withSession(['google_popup' => ['nonce' => 'nonce', 'started_at' => now()->timestamp]])
            ->postJson('/api/auth/google/popup', $payload)->assertUnprocessable();
        $this->assertGuest();
    }

    public function test_disabled_popup_and_admin_registration_are_rejected(): void
    {
        $token = $this->token($this->start());
        $this->postJson('/api/auth/google/popup', ['credential' => $token, 'intent' => 'register', 'role' => 'admin'])
            ->assertUnprocessable()->assertJsonValidationErrors('role');
        AppSetting::setValue('google.popup_enabled', '0');
        $this->postJson('/api/auth/google/popup/start')->assertForbidden();
        $this->postJson('/api/auth/google/popup', ['credential' => $token, 'intent' => 'login'])->assertForbidden();
        $this->getJson('/api/auth/google/status')->assertJsonPath('data.popup_enabled', false);
        Http::assertNothingSent();
    }

    public function test_admin_can_enable_popup_and_older_settings_clients_preserve_it(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        Sanctum::actingAs(User::factory()->admin()->create());
        $settings = ['enabled' => true, 'client_id' => 'popup-client.apps.googleusercontent.com'];
        $this->putJson('/api/admin/settings/google-auth', $settings + ['popup_enabled' => true])->assertOk()
            ->assertJsonPath('data.popup_enabled', true);
        $this->putJson('/api/admin/settings/google-auth', $settings)->assertOk()->assertJsonPath('data.popup_enabled', true);
        $this->assertSame('existing-secret', AppSetting::getValue('google.client_secret'));
    }

    public function test_popup_post_requires_csrf_protection(): void
    {
        // Laravel skips CSRF in tests; temporarily enable its normal runtime check.
        $this->app['env'] = 'local';
        $this->postJson('/api/auth/google/popup/start')->assertStatus(419);
        $this->postJson('/api/auth/google/popup', ['credential' => 'token'])->assertStatus(419);
    }
}
