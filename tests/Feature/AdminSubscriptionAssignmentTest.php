<?php

namespace Tests\Feature;

use App\Models\Subscription;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminSubscriptionAssignmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Sanctum::actingAs(User::factory()->admin()->create());
    }

    public function test_admin_can_assign_a_plan_for_a_custom_date_range(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = User::factory()->provider()->create();
        $plan = SubscriptionPlan::where('key', 'paid')->firstOrFail();

        $this->postJson('/api/admin/subscriptions/assign', [
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'starts_at' => '2026-09-10',
            'period_type' => 'custom',
            'ends_at' => '2026-12-31',
        ])->assertCreated()
            ->assertJsonPath('data.plan', 'paid')
            ->assertJsonPath('data.user.id', $user->id);

        $subscription = $user->subscriptions()->latest()->firstOrFail();
        $this->assertSame('2026-09-10 00:00:00', $subscription->starts_at->format('Y-m-d H:i:s'));
        $this->assertSame('2026-12-31 23:59:59', $subscription->ends_at->format('Y-m-d H:i:s'));
        $this->assertSame('admin_manual_assignment', $subscription->metadata['source']);
        $this->assertFalse($subscription->isActive());
    }

    public function test_admin_can_assign_a_duration_and_replace_current_access(): void
    {
        Carbon::setTestNow('2026-09-06 12:00:00');
        $user = User::factory()->provider()->create();
        $free = SubscriptionPlan::where('key', 'free')->firstOrFail();
        $paid = SubscriptionPlan::where('key', 'paid')->firstOrFail();
        $existing = Subscription::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $free->id,
            'plan' => 'free',
            'status' => 'active',
            'starts_at' => now()->subMonth(),
            'amount' => 0,
            'currency' => 'NGN',
        ]);

        $this->postJson('/api/admin/subscriptions/assign', [
            'user_id' => $user->id,
            'subscription_plan_id' => $paid->id,
            'starts_at' => '2026-09-06',
            'period_type' => 'duration',
            'duration_count' => 1,
            'duration_unit' => 'years',
        ])->assertCreated();

        $this->assertSame('cancelled', $existing->fresh()->status);
        $assigned = $user->subscriptions()->where('plan', 'paid')->firstOrFail();
        $this->assertSame('2027-09-06 00:00:00', $assigned->ends_at->format('Y-m-d H:i:s'));
        $this->assertTrue($assigned->isActive());
        $this->assertTrue($user->fresh()->hasPaidPlan());
    }

    public function test_assignment_dates_and_admin_targets_are_validated(): void
    {
        $admin = User::factory()->admin()->create();
        $plan = SubscriptionPlan::where('key', 'paid')->firstOrFail();

        $this->postJson('/api/admin/subscriptions/assign', [
            'user_id' => $admin->id,
            'subscription_plan_id' => $plan->id,
            'starts_at' => '2026-10-10',
            'period_type' => 'custom',
            'ends_at' => '2026-10-09',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('ends_at');

        $this->postJson('/api/admin/subscriptions/assign', [
            'user_id' => $admin->id,
            'subscription_plan_id' => $plan->id,
            'starts_at' => '2026-10-10',
            'period_type' => 'duration',
            'duration_count' => 30,
            'duration_unit' => 'days',
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Plans can only be assigned to provider or customer accounts.');
    }
    public function test_bulk_assignment_excludes_unselected_providers_and_expires_at_the_exact_end(): void
    {
        $this->travelTo(Carbon::parse('2026-09-18 12:00:00'));
        $providers = User::factory()->provider()->count(3)->create();
        $plan = SubscriptionPlan::where('key', 'paid')->firstOrFail();
        $this->postJson('/api/admin/subscriptions/assign', [
            'user_ids' => $providers->take(2)->pluck('id')->all(),
            'subscription_plan_id' => $plan->id,
            'starts_at' => '2026-09-18',
            'period_type' => 'duration',
            'duration_count' => 2,
            'duration_unit' => 'days',
        ])->assertCreated()->assertJsonPath('data.assigned_count', 2);

        $this->assertSame(0, $providers[2]->subscriptions()->count());
        $this->travelTo(Carbon::parse('2026-09-19 23:59:59'));
        foreach ($providers->take(2) as $provider) {
            $this->assertTrue($provider->fresh()->hasPaidPlan());
            $this->assertNull($provider->subscriptions()->first()->renews_at);
        }
        $this->travelTo(Carbon::parse('2026-09-20 00:00:00'));
        foreach ($providers->take(2) as $provider) {
            $this->assertFalse($provider->fresh()->hasPaidPlan());
            $this->assertSame('expired', $provider->subscriptions()->first()->status);
        }

        $provider = $providers[0];
        $provider->providerProfile()->create(['slug' => 'bulk-provider', 'profession' => 'Hair stylist', 'account_approved_at' => now()]);
        Sanctum::actingAs($provider->fresh());
        $this->getJson('/api/provider/subscription')->assertOk()->assertJsonPath('data.subscription', null);
        config(['services.paystack.secret_key' => 'sk_test_example']);
        \Illuminate\Support\Facades\Http::fake([
            'api.paystack.co/plan' => \Illuminate\Support\Facades\Http::response(['status' => true, 'data' => ['plan_code' => 'PLN_test']]),
            'api.paystack.co/transaction/initialize' => \Illuminate\Support\Facades\Http::response(['status' => true, 'data' => ['authorization_url' => 'https://checkout.paystack.com/test', 'access_code' => 'test']]),
        ]);
        $this->postJson('/api/provider/subscription/checkout', ['plan' => 'paid', 'gateway' => 'paystack', 'currency' => 'NGN'])->assertSuccessful();
        $this->assertSame('pending', $provider->subscriptionPayments()->firstOrFail()->status);
    }

    public function test_bulk_assignment_rejects_invalid_targets_without_partial_grants(): void
    {
        $provider = User::factory()->provider()->create();
        $customer = User::factory()->create();
        $payload = [
            'user_ids' => [$provider->id, $customer->id],
            'subscription_plan_id' => SubscriptionPlan::where('key', 'paid')->firstOrFail()->id,
            'starts_at' => '2026-09-18', 'period_type' => 'duration',
            'duration_count' => 1, 'duration_unit' => 'months',
        ];
        $this->postJson('/api/admin/subscriptions/assign', $payload)->assertUnprocessable()->assertJsonValidationErrors('user_ids.1');
        $this->assertSame(0, $provider->subscriptions()->count());
        Sanctum::actingAs($provider);
        $payload['user_ids'] = [$provider->id];
        $this->postJson('/api/admin/subscriptions/assign', $payload)->assertForbidden();
    }

    public function test_select_all_returns_all_matching_provider_ids_across_pages(): void
    {
        $providers = User::factory()->provider()->count(22)->create(['name' => 'Matching provider']);
        User::factory()->provider()->create(['name' => 'Other name']);
        User::factory()->create(['name' => 'Matching customer']);
        $response = $this->getJson('/api/admin/users?selection_ids=1&search=Matching&per_page=10')->assertOk();
        $this->assertEqualsCanonicalizing($providers->pluck('id')->all(), $response->json('data'));
    }

}
