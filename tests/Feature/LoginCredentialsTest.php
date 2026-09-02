<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\EmailChangeVerificationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LoginCredentialsTest extends TestCase
{
    use RefreshDatabase;

    public function test_every_role_can_update_password_with_current_password_and_revoke_access(): void
    {
        Notification::fake();
        config(['session.driver' => 'database']);

        foreach (['customer', 'provider', 'admin'] as $index => $role) {
            $user = User::factory()->create(['role' => $role]);
            $user->createToken('old-token');
            DB::table('sessions')->insert([
                'id' => "old-session-{$index}",
                'user_id' => $user->id,
                'ip_address' => '127.0.0.1',
                'user_agent' => 'Test',
                'payload' => 'test',
                'last_activity' => now()->timestamp,
            ]);

            Sanctum::actingAs($user);
            $this->putJson('/api/auth/password', [
                'current_password' => 'password',
                'password' => 'SecurePass123',
                'password_confirmation' => 'SecurePass123',
            ])->assertOk();

            $this->assertTrue(Hash::check('SecurePass123', $user->fresh()->password));
            $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);
            $this->assertDatabaseMissing('sessions', ['id' => "old-session-{$index}"]);
        }
    }

    public function test_password_change_rejects_wrong_current_password_and_weak_or_reused_passwords(): void
    {
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/password', [
            'current_password' => 'wrong-password',
            'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'The current password is incorrect.');

        $this->putJson('/api/auth/password', [
            'current_password' => 'password',
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->putJson('/api/auth/password', [
            'current_password' => 'password',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertUnprocessable();

        $this->assertTrue(Hash::check('password', $user->fresh()->password));
    }

    public function test_password_change_invalidates_a_pending_email_change(): void
    {
        Notification::fake();
        $user = User::factory()->create([
            'pending_email' => 'pending@example.test',
            'pending_email_token_hash' => hash('sha256', 'pending-token'),
            'pending_email_expires_at' => now()->addHour(),
        ]);
        Sanctum::actingAs($user);

        $this->putJson('/api/auth/password', [
            'current_password' => 'password',
            'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123',
        ])->assertOk();

        $user->refresh();
        $this->assertNull($user->pending_email);
        $this->assertNull($user->pending_email_token_hash);
        $this->assertNull($user->pending_email_expires_at);
    }

    public function test_email_change_stays_pending_until_new_address_is_verified(): void
    {
        Notification::fake();
        $user = User::factory()->admin()->create(['email' => 'admin@beautyprohq.test']);
        $user->createToken('old-token');
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/email-change', [
            'current_password' => 'password',
            'email' => 'New@Example.test',
        ])->assertOk()
            ->assertJsonPath('data.email', 'admin@beautyprohq.test')
            ->assertJsonPath('data.pending_email', 'new@example.test');

        $user->refresh();
        $this->assertSame('admin@beautyprohq.test', $user->email);
        $this->assertSame('new@example.test', $user->pending_email);

        $verificationToken = null;
        Notification::assertSentOnDemand(
            EmailChangeVerificationNotification::class,
            function (EmailChangeVerificationNotification $notification) use (&$verificationToken): bool {
                $verificationToken = $notification->token;

                return true;
            },
        );

        $url = URL::temporarySignedRoute('email-change.verify', now()->addMinutes(60), [
            'user' => $user->id,
            'token' => $verificationToken,
        ]);

        $this->get($url)->assertRedirect(rtrim(config('app.frontend_url'), '/').'/login?email_changed=1');

        $user->refresh();
        $this->assertSame('new@example.test', $user->email);
        $this->assertNotNull($user->email_verified_at);
        $this->assertNull($user->pending_email);
        $this->assertNull($user->pending_email_token_hash);
        $this->assertNotNull($user->login_email_changed_at);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $user->id]);

        Sanctum::actingAs($user);
        $this->postJson('/api/auth/email-change', [
            'current_password' => 'password',
            'email' => 'another@example.test',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'The one-time administrator email change has already been used.');
    }

    public function test_email_change_requires_current_password_and_an_available_address(): void
    {
        Notification::fake();
        User::factory()->create(['email' => 'taken@example.test']);
        $user = User::factory()->admin()->create(['email' => 'current@example.test']);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/email-change', [
            'current_password' => 'wrong-password',
            'email' => 'available@example.test',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'The current password is incorrect.');

        $this->postJson('/api/auth/email-change', [
            'current_password' => 'password',
            'email' => 'TAKEN@example.test',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertSame('current@example.test', $user->fresh()->email);
        $this->assertNull($user->fresh()->pending_email);
    }

    public function test_correctly_signed_link_with_wrong_token_cannot_change_email(): void
    {
        Notification::fake();
        $user = User::factory()->admin()->create(['email' => 'old@example.test']);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/email-change', [
            'current_password' => 'password',
            'email' => 'new@example.test',
        ])->assertOk();

        $url = URL::temporarySignedRoute('email-change.verify', now()->addMinutes(60), [
            'user' => $user->id,
            'token' => 'wrong-token',
        ]);

        $this->get($url)->assertRedirect(rtrim(config('app.frontend_url'), '/').'/login?email_change_error=invalid');
        $this->assertSame('old@example.test', $user->fresh()->email);
    }

    public function test_customers_and_providers_cannot_request_login_email_changes(): void
    {
        Notification::fake();

        foreach (['customer', 'provider'] as $role) {
            $user = User::factory()->create(['role' => $role]);
            Sanctum::actingAs($user);

            $this->postJson('/api/auth/email-change', [
                'current_password' => 'password',
                'email' => "new-{$role}@example.test",
            ])->assertForbidden()
                ->assertJsonPath('message', 'Only an administrator can change a login email.');

            $this->assertNull($user->fresh()->pending_email);
        }
    }
}
