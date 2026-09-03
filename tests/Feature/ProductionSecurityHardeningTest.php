<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\UploadedMedia;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductionSecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_verification_documents_are_private_and_owner_or_admin_only(): void
    {
        Storage::fake('verification');
        Storage::fake('public');
        [$owner, $ownerProfile] = $this->provider('Private Documents');
        [$other] = $this->provider('Other Provider');

        Sanctum::actingAs($owner);
        $reference = $this->post('/api/provider/verification/files', [
            'type' => 'certification',
            'file' => UploadedFile::fake()->create('certificate.pdf', 20, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated()->json('data.path');

        $this->assertMatchesRegularExpression('/^media:\d+$/', $reference);
        $media = UploadedMedia::findOrFail((int) str($reference)->after('media:')->value());
        $this->assertSame('verification', $media->disk);
        $this->assertSame($owner->id, $media->user_id);
        Storage::disk('verification')->assertExists($media->path);
        Storage::disk('public')->assertMissing($media->path);

        $this->get("/api/media/{$media->id}/download")
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=0, no-store, private');

        Sanctum::actingAs($other);
        $this->get("/api/media/{$media->id}/download")->assertNotFound();
        $this->postJson('/api/provider/verification', [
            'portfolio_links' => ['uploads/portfolio.webp'],
            'professional_info' => 'Attempt to attach a document that belongs to a different provider account.',
            'certification_files' => [$reference],
        ])->assertUnprocessable();

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->get("/api/media/{$media->id}/download")->assertOk();
        $this->assertNotNull($ownerProfile);
    }

    public function test_required_malware_scanner_fails_closed_when_unavailable(): void
    {
        config()->set('security.uploads.malware_scan.enabled', false);
        config()->set('security.uploads.malware_scan.required', true);
        Storage::fake('verification');
        [$provider] = $this->provider('Scan Required');
        Sanctum::actingAs($provider);

        $this->post('/api/provider/verification/files', [
            'type' => 'license',
            'file' => UploadedFile::fake()->create('license.pdf', 20, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        $this->assertDatabaseCount('uploaded_media', 0);
    }

    public function test_unsubmitted_private_documents_are_pruned_after_retention_window(): void
    {
        Storage::fake('verification');
        [$provider, $profile] = $this->provider('Retention Provider');
        $referenced = UploadedMedia::create([
            'user_id' => $provider->id,
            'disk' => 'verification',
            'path' => 'uploads/referenced.pdf',
            'filename' => 'referenced.pdf',
            'mime_type' => 'application/pdf',
            'size' => 10,
            'collection' => 'provider_verification_certification',
            'created_at' => now()->subDays(8),
        ]);
        $orphan = UploadedMedia::create([
            'user_id' => $provider->id,
            'disk' => 'verification',
            'path' => 'uploads/orphan.pdf',
            'filename' => 'orphan.pdf',
            'mime_type' => 'application/pdf',
            'size' => 10,
            'collection' => 'provider_verification_license',
            'created_at' => now()->subDays(8),
        ]);
        Storage::disk('verification')->put($referenced->path, 'referenced');
        Storage::disk('verification')->put($orphan->path, 'orphan');
        $profile->verificationRequests()->create([
            'professional_info' => 'Submitted verification record.',
            'certification_files' => ['media:'.$referenced->id],
            'status' => 'pending',
        ]);

        $this->artisan('media:prune-orphaned-verification')->assertSuccessful();

        $this->assertDatabaseHas('uploaded_media', ['id' => $referenced->id]);
        $this->assertDatabaseMissing('uploaded_media', ['id' => $orphan->id]);
        Storage::disk('verification')->assertExists($referenced->path);
        Storage::disk('verification')->assertMissing($orphan->path);
    }

    public function test_sensitive_admin_action_requires_and_accepts_session_bound_step_up(): void
    {
        $admin = User::factory()->admin()->create([
            'email' => 'admin-step-up@example.test',
            'password' => 'Password123',
        ]);
        $target = User::factory()->create();
        $csrf = 'admin-step-up-csrf';
        $this->withSession(['_token' => $csrf])
            ->withHeader('X-CSRF-TOKEN', $csrf)
            ->withHeader('Referer', rtrim(config('app.url'), '/').'/');

        $this->postJson('/api/auth/login', [
            'email' => $admin->email,
            'password' => 'Password123',
        ])->assertOk();

        $this->deleteJson("/api/admin/users/{$target->id}", ['confirmation' => 'DELETE'])
            ->assertStatus(428)
            ->assertJsonPath('code', 'ADMIN_STEP_UP_REQUIRED');

        $this->postJson('/api/admin/security/step-up', ['password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/admin/security/step-up', ['password' => 'Password123'])->assertOk();
        $this->deleteJson("/api/admin/users/{$target->id}", ['confirmation' => 'DELETE'])->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $target->id]);
    }

    public function test_gateway_secrets_are_encrypted_and_removed_from_queryable_json(): void
    {
        $user = User::factory()->create();
        $payment = SubscriptionPayment::create([
            'user_id' => $user->id,
            'gateway' => 'paystack',
            'reference' => 'secure-reference',
            'amount' => 5000,
            'currency' => 'NGN',
            'status' => 'paid',
            'raw_response' => [
                'data' => [
                    'metadata' => ['type' => 'provider_subscription'],
                    'email_token' => 'highly-sensitive-token',
                    'customer' => ['email' => 'private@example.test'],
                ],
            ],
        ]);
        $subscription = Subscription::create([
            'user_id' => $user->id,
            'plan' => 'paid',
            'status' => 'active',
            'amount' => 5000,
            'currency' => 'NGN',
            'starts_at' => now(),
            'renews_at' => now()->addMonth(),
            'metadata' => [
                'gateway' => 'paystack',
                'paystack_email_token' => 'subscription-secret-token',
            ],
        ]);

        $rawPayment = DB::table('subscription_payments')->where('id', $payment->id)->first();
        $rawSubscription = DB::table('subscriptions')->where('id', $subscription->id)->first();
        $this->assertStringNotContainsString('highly-sensitive-token', (string) $rawPayment->raw_response);
        $this->assertStringNotContainsString('private@example.test', (string) $rawPayment->raw_response);
        $this->assertStringNotContainsString('highly-sensitive-token', (string) $rawPayment->secure_payload);
        $this->assertStringNotContainsString('subscription-secret-token', (string) $rawSubscription->secure_metadata);
        $this->assertSame('highly-sensitive-token', $payment->fresh()->gatewayPayload()['data']['email_token']);
        $this->assertSame('subscription-secret-token', $subscription->fresh()->gatewaySecret('paystack_email_token'));
        $this->assertSame('provider_subscription', data_get($payment->fresh()->raw_response, 'data.metadata.type'));
    }

    private function provider(string $name): array
    {
        $user = User::factory()->create([
            'name' => $name,
            'role' => 'provider',
            'email_verified_at' => now(),
        ]);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => str($name)->slug()->value(),
            'profession' => 'Beauty Professional',
            'verified' => true,
            'account_approved_at' => now(),
        ]);

        return [$user, $profile];
    }
}
