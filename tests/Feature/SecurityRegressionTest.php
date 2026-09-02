<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SecurityRegressionTest extends TestCase
{
    use RefreshDatabase;

    public function test_claiming_a_guest_account_requires_email_verification_before_customer_data_is_available(): void
    {
        $guest = User::factory()->create([
            'email' => 'guest-owner@example.test',
            'is_guest' => true,
            'email_verified_at' => now(),
        ]);

        $this->postJson('/api/auth/register', [
            'name' => 'Guest Owner',
            'email' => 'guest-owner@example.test',
            'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123',
            'role' => 'customer',
        ])->assertCreated();

        $guest->refresh();
        $this->assertFalse($guest->is_guest);
        $this->assertNull($guest->email_verified_at);

        Sanctum::actingAs($guest);
        $this->getJson('/api/customer/dashboard')->assertForbidden();

        $hash = sha1($guest->getEmailForVerification());
        $url = URL::temporarySignedRoute('verification.verify', now()->addHour(), [
            'id' => $guest->id,
            'hash' => $hash,
        ], false);
        $this->getJson($url)->assertOk();

        Sanctum::actingAs($guest->fresh());
        $this->getJson('/api/customer/dashboard')->assertOk();
    }

    public function test_unverified_accounts_cannot_upload_files(): void
    {
        Storage::fake('public');
        $customer = User::factory()->unverified()->create(['role' => 'customer']);
        Sanctum::actingAs($customer);

        $this->postJson('/api/upload', [
            'file' => UploadedFile::fake()->create('verification.pdf', 10, 'application/pdf'),
        ])->assertForbidden();
    }

    public function test_upload_quota_is_enforced_before_a_file_is_stored(): void
    {
        Storage::fake('public');
        config(['security.uploads.user_quota_bytes' => 1]);
        $customer = User::factory()->create(['role' => 'customer']);
        Sanctum::actingAs($customer);

        $this->postJson('/api/upload', [
            'file' => UploadedFile::fake()->create('verification.pdf', 10, 'application/pdf'),
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        Storage::disk('public')->assertMissing('uploads');
    }

    public function test_admin_api_is_not_excluded_from_csrf_protection(): void
    {
        $bootstrap = file_get_contents(base_path('bootstrap/app.php'));

        $this->assertStringNotContainsString("'api/admin/*'", $bootstrap);
    }
}
