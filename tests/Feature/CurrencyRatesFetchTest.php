<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CurrencyRatesFetchTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_fetch_live_currency_rates(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        Http::fake([
            'open.er-api.com/*' => Http::response([
                'result' => 'success',
                'base_code' => 'NGN',
                'rates' => [
                    'NGN' => 1,
                    'USD' => 0.000752,
                    'EUR' => 0.000641,
                    'GBP' => 0.00055,
                ],
            ]),
        ]);

        $response = $this->postJson('/api/admin/settings/currencies/fetch-rates', ['default' => 'NGN'])
            ->assertOk()
            ->assertJsonPath('data.base', 'NGN')
            ->assertJsonPath('data.source', 'open.er-api.com (ECB/published rates)');

        $this->assertClose((float) $response->json('data.rates.NGN'), 1.0);
        $this->assertClose((float) $response->json('data.rates.USD'), 0.000752);
    }

    public function test_fetch_rates_uses_configured_default_when_none_sent(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        Http::fake([
            'open.er-api.com/*' => Http::response([
                'result' => 'success',
                'base_code' => 'USD',
                'rates' => ['NGN' => 1300, 'USD' => 1, 'EUR' => 0.85, 'GBP' => 0.75],
            ]),
        ]);

        $response = $this->postJson('/api/admin/settings/currencies/fetch-rates')
            ->assertOk()
            ->assertJsonPath('data.base', 'NGN');

        $this->assertClose((float) $response->json('data.rates.NGN'), 1.0);
    }

    public function test_fetch_rates_returns_502_when_api_unavailable(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        Http::fake([
            'open.er-api.com/*' => Http::response(['error' => 'nope'], 500),
        ]);

        $this->postJson('/api/admin/settings/currencies/fetch-rates', ['default' => 'NGN'])
            ->assertStatus(502);
    }

    private function assertClose(float $actual, float $expected): void
    {
        $this->assertTrue(abs($actual - $expected) < 0.0001, "Expected $expected, got $actual");
    }
}
