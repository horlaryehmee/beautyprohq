<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminHeroImageUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_upload_hero_images_save_order_and_clear_them(): void
    {
        Storage::fake('public');
        Sanctum::actingAs(User::factory()->admin()->create());
        $bytes = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
        $urls = [];
        foreach (['first.png', 'second.png'] as $name) {
            $response = $this->postJson('/api/admin/settings/hero-images/upload', [
                'image' => UploadedFile::fake()->createWithContent($name, $bytes),
            ])->assertCreated();
            Storage::disk('public')->assertExists($response->json('data.path'));
            $this->assertDatabaseHas('uploaded_media', ['path' => $response->json('data.path'), 'collection' => 'homepage_hero']);
            $urls[] = $response->json('data.url');
        }
        $this->putJson('/api/admin/settings/hero-images', ['images' => array_reverse($urls)])->assertOk();
        $this->getJson('/api/admin/settings/hero-images')->assertOk()->assertJsonPath('data.images', array_reverse($urls));
        $this->putJson('/api/admin/settings/hero-images', ['images' => []])->assertOk()->assertJsonPath('data.images', []);
    }

    public function test_saved_hero_images_replace_fallbacks_and_old_local_https_urls_are_repaired(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        config(['app.url' => 'http://127.0.0.1:8000']);
        $this->putJson('/api/admin/settings/hero-images', ['images' => ['https://127.0.0.1:8000/storage/uploads/first.webp', '/storage/uploads/second.webp']])->assertOk();
        $expected = ['/storage/uploads/first.webp', '/storage/uploads/second.webp'];
        $this->getJson('/api/admin/settings/hero-images')->assertJsonPath('data.images', $expected);
        $this->getJson('/api/home/hero-images')->assertJsonPath('data.images', $expected);
        $this->assertSame($expected, \App\Support\HomepageShell::heroImages());
        $this->putJson('/api/admin/settings/hero-images', ['images' => [$expected[0]]])->assertOk();
        $this->getJson('/api/home/hero-images')->assertJsonPath('data.images', [$expected[0]]);
    }

    public function test_all_twenty_images_are_available_to_the_homepage(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $images = array_map(fn ($i) => '/storage/uploads/hero-'.$i.'.webp', range(1, 20));
        $this->putJson('/api/admin/settings/hero-images', ['images' => $images])->assertOk();
        $this->getJson('/api/home/hero-images')->assertJsonPath('data.images', $images);
    }

    public function test_invalid_images_and_non_admin_uploads_are_rejected(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->postJson('/api/admin/settings/hero-images/upload', ['image' => UploadedFile::fake()->create('document.pdf', 20, 'application/pdf')])->assertUnprocessable();
        $this->postJson('/api/admin/settings/hero-images/upload', ['image' => UploadedFile::fake()->create('large.png', 12289, 'image/png')])->assertUnprocessable();
        $this->putJson('/api/admin/settings/hero-images', ['images' => array_fill(0, 21, 'https://example.test/image.png')])->assertUnprocessable();
        Sanctum::actingAs(User::factory()->provider()->create());
        $this->postJson('/api/admin/settings/hero-images/upload')->assertForbidden();
    }
}
