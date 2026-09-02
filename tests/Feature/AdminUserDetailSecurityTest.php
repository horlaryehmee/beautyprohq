<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\EmailChangeVerificationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUserDetailSecurityTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_detail_endpoint_cannot_bypass_login_email_policy(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create([
            'email' => 'customer@example.test',
            'email_verified_at' => null,
        ]);
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/users/{$target->id}", [
            'email' => 'changed@example.test',
            'email_verified' => true,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'email_verified']);

        $target->refresh();
        $this->assertSame('customer@example.test', $target->email);
        $this->assertNull($target->email_verified_at);
    }

    public function test_admin_detail_can_still_update_non_credential_account_fields(): void
    {
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create();
        Sanctum::actingAs($admin);

        $this->patchJson("/api/admin/users/{$target->id}", [
            'name' => 'Updated Customer',
            'phone' => '+2348012345678',
            'is_active' => false,
        ])->assertOk();

        $this->assertDatabaseHas('users', [
            'id' => $target->id,
            'name' => 'Updated Customer',
            'phone' => '+2348012345678',
            'is_active' => false,
        ]);
    }

    public function test_admin_can_request_a_verified_email_change_for_another_user(): void
    {
        Notification::fake();
        $admin = User::factory()->admin()->create();
        $target = User::factory()->create(['email' => 'customer@example.test']);
        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/users/{$target->id}/email-change", [
            'current_password' => 'wrong-password',
            'email' => 'new-customer@example.test',
        ])->assertUnprocessable();
        $this->assertNull($target->fresh()->pending_email);

        $this->postJson("/api/admin/users/{$target->id}/email-change", [
            'current_password' => 'password',
            'email' => 'New-Customer@Example.test',
        ])->assertOk()
            ->assertJsonPath('data.email', 'customer@example.test')
            ->assertJsonPath('data.pending_email', 'new-customer@example.test');

        $target->refresh();
        $this->assertSame('customer@example.test', $target->email);
        $this->assertSame('admin_managed', $target->pending_email_change_context);

        $verificationToken = null;
        Notification::assertSentOnDemand(
            EmailChangeVerificationNotification::class,
            function (EmailChangeVerificationNotification $notification) use (&$verificationToken): bool {
                $verificationToken = $notification->token;

                return true;
            },
        );

        $url = URL::temporarySignedRoute('email-change.verify', now()->addMinutes(60), [
            'user' => $target->id,
            'token' => $verificationToken,
        ]);
        $this->get($url)->assertRedirect(rtrim(config('app.frontend_url'), '/').'/login?email_changed=1');

        $target->refresh();
        $this->assertSame('new-customer@example.test', $target->email);
        $this->assertNotNull($target->email_verified_at);
        $this->assertNull($target->pending_email);
        $this->assertNull($target->pending_email_change_context);
    }

    public function test_admin_cannot_use_managed_email_change_or_delete_on_their_own_account(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->postJson("/api/admin/users/{$admin->id}/email-change", [
            'current_password' => 'password',
            'email' => 'new-admin@example.test',
        ])->assertUnprocessable();

        $this->deleteJson("/api/admin/users/{$admin->id}", [
            'confirmation' => 'DELETE',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'You cannot delete your own admin account.');

        $this->assertDatabaseHas('users', ['id' => $admin->id]);
    }
}
