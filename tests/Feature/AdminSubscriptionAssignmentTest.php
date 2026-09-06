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
}
