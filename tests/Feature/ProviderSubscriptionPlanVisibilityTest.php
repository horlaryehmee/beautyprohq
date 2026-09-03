<?php

namespace Tests\Feature;

use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProviderSubscriptionPlanVisibilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_provider_subscription_plan_list_respects_daily_test_is_active(): void
    {
        $plan = SubscriptionPlan::where('key', 'daily_test')->firstOrFail();
        $plan->update(['is_active' => false]);

        $provider = User::factory()->provider()->create();
        $provider->providerProfile()->create(['slug' => 'approved-pro-'.$provider->id, 'profession' => 'Artist', 'account_approved_at' => now()]);
        Sanctum::actingAs($provider);

        $response = $this->getJson('/api/provider/subscription')->assertOk();

        $plans = $response->json('data.plans') ?? [];
        $keys = array_column($plans, 'key');

        $this->assertContains('free', $keys);
        $this->assertNotContains('daily_test', $keys);

        // Re-enable it and confirm it returns.
        $plan->update(['is_active' => true]);
        $enabled = $this->getJson('/api/provider/subscription')->assertOk()->json('data.plans') ?? [];
        $this->assertContains('daily_test', array_column($enabled, 'key'));
    }

    public function test_public_plan_list_also_hides_inactive_daily_test(): void
    {
        SubscriptionPlan::where('key', 'daily_test')->firstOrFail()->update(['is_active' => false]);

        $response = $this->getJson('/api/subscription-plans')->assertOk();

        $plans = $response->json('data.plans') ?? [];
        $keys = array_column($plans, 'key');

        $this->assertNotContains('daily_test', $keys);
    }
}
