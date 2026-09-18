<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureRecentAdminAuthentication;
use App\Models\ProviderProfile;
use App\Models\User;
use App\Services\BeautypreneurhubImport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class BeautypreneurhubImportTest extends TestCase
{
    use RefreshDatabase;

    private array $files = [];

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        config(['hashing.bcrypt.rounds' => 4]);
        Sanctum::actingAs(User::factory()->admin()->create());
    }

    protected function tearDown(): void
    {
        foreach ($this->files as $file) {
            @unlink($file);
        }
        parent::tearDown();
    }

    private function listing(int $id, string $email = 'owner@example.test'): array
    {
        return ['wordpress_listing_id' => $id, 'imported_email' => $email, 'name' => 'Beauty business', 'profession' => 'Makeup Artist', 'category' => ['name' => 'Makeup Artist', 'slug' => 'makeup-artist'], 'default_currency' => 'NGN', 'is_listed' => true, 'availability' => [['day_of_week' => 1, 'start_time' => '09:00:00', 'end_time' => '17:00:00', 'is_active' => true]]];
    }

    private function package(array $listings, array $media = []): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'bphq-import-');
        $this->files[] = $path;
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $hashes = [];
        foreach ($media as $name => $bytes) {
            $hashes[$name] = hash('sha256', $bytes);
            $zip->addFromString($name, $bytes);
        }
        $zip->addFromString('manifest.json', json_encode(['source' => 'beautypreneurhub', 'version' => 1, 'listings' => $listings, 'media' => $hashes]));
        $zip->close();

        return new UploadedFile($path, 'beautypreneurhub.zip', 'application/zip', null, true);
    }

    private function import(UploadedFile $package)
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);

        return $this->post('/api/admin/settings/beautypreneurhub-import', ['package' => $package], ['Accept' => 'application/json']);
    }

    public function test_import_creates_normal_providers_with_images_and_free_access_and_runs_only_once(): void
    {
        $bytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
        $name = 'media/'.hash('sha256', $bytes).'.png';
        $package = $this->package([$this->listing(10) + ['profile_photo' => $name]], [$name => $bytes]);
        $this->getJson('/api/admin/settings/beautypreneurhub-import')->assertJsonPath('data.completed', false);
        $this->import($package)->assertOk()->assertJsonPath('data.result.created', 1)->assertJsonPath('data.completed', true);
        $profile = ProviderProfile::where('wordpress_listing_id', 10)->firstOrFail();
        $this->assertSame('provider', $profile->user->role);
        $this->assertTrue($profile->user->is_active);
        $this->assertFalse($profile->user->is_demo);
        $this->assertNull($profile->user->email_verified_at);
        $this->assertSame('bcrypt', Hash::info($profile->user->password)['algoName']);
        $this->assertTrue($profile->user->subscriptions()->first()->isActive());
        $this->assertSame(1, $profile->availability()->count());
        Storage::disk('public')->assertExists($profile->profile_photo);
        $this->getJson('/api/admin/settings/beautypreneurhub-import')->assertJsonPath('data.completed', true);
        $this->import($package)->assertConflict();
        $this->assertSame(1, ProviderProfile::count());
    }

    public function test_existing_accounts_and_claimed_listings_are_never_overwritten(): void
    {
        $owner = User::factory()->provider()->create(['email' => 'owner@example.test']);
        $profile = $owner->providerProfile()->create(['slug' => 'owner', 'profession' => 'Owner edits', 'wordpress_listing_id' => 10, 'claimed_at' => now()]);
        $password = $owner->password;
        $this->import($this->package([$this->listing(10), $this->listing(11), $this->listing(12)]))
            ->assertOk()->assertJsonPath('data.result.preserved', 1)->assertJsonPath('data.result.created', 2);
        $this->assertSame('Owner edits', $profile->fresh()->profession);
        $this->assertSame($password, $owner->fresh()->password);
        foreach (ProviderProfile::whereIn('wordpress_listing_id', [11, 12])->get() as $imported) {
            $this->assertSame('owner@example.test', $imported->imported_email);
            $this->assertStringEndsWith('@import.beautyprohq.invalid', $imported->user->email);
        }
    }

    public function test_failed_import_rolls_back_and_can_be_retried(): void
    {
        // A valid package with a missing image must never set the completion flag.
        $this->import($this->package([$this->listing(10) + ['profile_photo' => 'media/'.str_repeat('a', 64).'.png']]))->assertUnprocessable();
        $this->assertSame(0, ProviderProfile::count());
        $this->assertFalse(app(BeautypreneurhubImport::class)->status()['completed']);
        $this->import($this->package([$this->listing(10)]))->assertOk();
    }

    public function test_database_failure_rolls_back_earlier_users_and_the_completion_marker(): void
    {
        ProviderProfile::creating(function (ProviderProfile $profile): void {
            if ($profile->wordpress_listing_id === 11) {
                throw new \RuntimeException('Simulated failure');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->import($this->package([$this->listing(10), $this->listing(11, 'fail@example.test')]));
            $this->fail('Expected an import failure.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Simulated failure', $exception->getMessage());
        } finally {
            ProviderProfile::flushEventListeners();
        }
        $this->assertDatabaseMissing('users', ['email' => 'owner@example.test']);
        $this->assertSame(0, ProviderProfile::count());
        $this->assertFalse(app(BeautypreneurhubImport::class)->status()['completed']);
    }

    public function test_imported_owner_can_claim_and_access_standard_provider_features(): void
    {
        $this->import($this->package([$this->listing(10)]))->assertOk();
        $profile = ProviderProfile::where('wordpress_listing_id', 10)->firstOrFail();
        $token = str_repeat('a', 64);
        $profile->update(['claim_token_hash' => hash('sha256', $token), 'claim_expires_at' => now()->addHour()]);
        auth()->forgetGuards();
        auth()->shouldUse('web');
        $this->withHeader('Origin', 'http://localhost:5173')->postJson('/api/auth/claim/complete', [
            'listing' => $profile->id, 'token' => $token, 'password' => 'SecurePass123',
            'password_confirmation' => 'SecurePass123', 'accept_terms' => true,
        ])->assertOk()->assertJsonPath('data.redirect', '/provider');
        $this->assertTrue(Hash::check('SecurePass123', $profile->user->fresh()->password));
        Sanctum::actingAs($profile->user->fresh());
        $this->getJson('/api/provider/profile')->assertOk();
        $this->getJson('/api/provider/subscription')->assertOk()->assertJsonPath('data.subscription.plan', 'free');
    }

    public function test_invalid_media_paths_and_duplicate_source_ids_are_rejected(): void
    {
        $this->import($this->package([$this->listing(10) + ['cover_image' => '../../public/evil.php']]))->assertUnprocessable();
        $this->import($this->package([$this->listing(10), $this->listing(10)]))->assertUnprocessable();
        $this->assertDatabaseMissing('app_settings', ['key' => BeautypreneurhubImport::KEY]);
    }

    public function test_only_admins_with_recent_confirmation_can_import(): void
    {
        $this->postJson('/api/admin/settings/beautypreneurhub-import')->assertStatus(428);
        Sanctum::actingAs(User::factory()->provider()->create());
        $this->getJson('/api/admin/settings/beautypreneurhub-import')->assertForbidden();
        $this->postJson('/api/admin/settings/beautypreneurhub-import')->assertForbidden();
    }
}
