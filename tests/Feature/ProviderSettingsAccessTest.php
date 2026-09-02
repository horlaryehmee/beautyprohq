<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProviderSettingsAccessTest extends TestCase
{
    use RefreshDatabase;

    public function test_free_approved_provider_can_view_and_update_settings(): void
    {
        $user = User::factory()->provider()->create();
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'free-provider-settings',
            'profession' => 'Beauty professional',
            'account_approved_at' => now(),
            'default_currency' => 'NGN',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/provider/settings')
            ->assertOk()
            ->assertJsonPath('data.default_currency', 'NGN');

        $this->putJson('/api/provider/settings', [
            'default_currency' => 'USD',
            'default_payment_gateway' => null,
            'timezone' => 'Africa/Lagos',
            'whatsapp_number' => null,
            'whatsapp_notifications_enabled' => false,
        ])->assertOk()
            ->assertJsonPath('data.default_currency', 'USD');

        $this->assertSame('USD', $profile->fresh()->default_currency);
    }
}
