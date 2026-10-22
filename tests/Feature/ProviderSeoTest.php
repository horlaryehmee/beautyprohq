<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProviderSeoTest extends TestCase
{
    use RefreshDatabase;

    public function test_listed_provider_has_crawlable_unique_html_and_appears_in_sitemap(): void
    {
        $user = User::factory()->provider()->create(['name' => 'Ada Glam']);
        $provider = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'ada-glam',
            'profession' => 'Makeup artist & Educator',
            'country' => 'Nigeria',
            'city' => 'Lagos',
            'bio' => 'Bridal makeup and hands-on lessons for aspiring artists.',
            'is_listed' => true,
            'account_approved_at' => now(),
        ]);

        $this->get('/robots.txt')->assertOk()
            ->assertSee('Disallow: /provider/', false)
            ->assertDontSee('Disallow: /provider' . "\n", false);

        $this->get('/providers/'.$provider->slug)->assertOk()
            ->assertSee('<title>Ada Glam - Makeup artist &amp; Educator in Lagos, Nigeria | BeautyPro HQ</title>', false)
            ->assertSee('Bridal makeup and hands-on lessons for aspiring artists.', false)
            ->assertSee('<h1>Ada Glam - Makeup artist &amp; Educator in Lagos, Nigeria</h1>', false)
            ->assertSee('<link rel="canonical" href="'.url('/providers/ada-glam').'">', false);

        $this->get('/sitemap.xml')->assertOk()->assertSee(url('/providers/ada-glam'), false);
        $this->get('/providers/'.$provider->id)->assertRedirect(url('/providers/ada-glam'));
    }

    public function test_public_pages_have_distinct_server_metadata_and_private_pages_are_not_indexed(): void
    {
        AppSetting::setValue('features.coming_soon', '0');
        $this->get('/directory')->assertOk()
            ->assertSee('<title>Find Beauty Professionals | BeautyPro HQ</title>', false)
            ->assertSee('<link rel="canonical" href="'.url('/directory').'">', false);

        $this->get('/events')->assertOk()
            ->assertSee('<title>Beauty Events and Workshops | BeautyPro HQ</title>', false);

        $this->get('/provider')->assertOk()
            ->assertSee('<meta name="robots" content="noindex, nofollow">', false);

        $this->get('/not-a-real-page')->assertNotFound();
        $this->get('/resources')->assertRedirect('/news');
    }
}
