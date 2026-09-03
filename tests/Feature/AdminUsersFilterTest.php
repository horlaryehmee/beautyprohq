<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUsersFilterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $admin = User::factory()->admin()->create();

        Sanctum::actingAs($admin);

        return $admin;
    }

    public function test_admin_can_filter_users_by_role(): void
    {
        $this->admin();

        $providers = User::factory()->provider()->count(2)->create();
        User::factory()->count(3)->create();
        User::factory()->admin()->count(1)->create();

        $this->getJson('/api/admin/users?role=provider')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_admin_can_filter_users_by_active_status(): void
    {
        $this->admin();

        $active = 3;
        $suspended = 1;
        User::factory()->count($active)->create(['is_active' => true]);
        User::factory()->count($suspended)->create(['is_active' => false]);

        $this->getJson('/api/admin/users?is_active=0')
            ->assertOk()
            ->assertJsonCount($suspended, 'data');

        // The acting admin is active, so it is included alongside the active users.
        $this->getJson('/api/admin/users?is_active=1')
            ->assertOk()
            ->assertJsonCount($active + 1, 'data');
    }

    public function test_admin_can_filter_users_by_verification_status(): void
    {
        $this->admin();

        $verifiedUser = User::factory()->provider()->create();
        ProviderProfile::create(['user_id' => $verifiedUser->id, 'slug' => 'verified-pro', 'profession' => 'Artist', 'verified' => true]);

        $unverifiedUser = User::factory()->provider()->create();
        ProviderProfile::create(['user_id' => $unverifiedUser->id, 'slug' => 'unverified-pro', 'profession' => 'Artist', 'verified' => false]);

        // A customer with no provider profile counts as unverified.
        User::factory()->create();

        $this->getJson('/api/admin/users?verification=verified')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', $verifiedUser->email);

        $this->getJson('/api/admin/users?verification=unverified')
            ->assertOk();
    }

    public function test_admin_can_sort_users_by_name(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Admin User']);
        Sanctum::actingAs($admin);

        User::factory()->create(['name' => 'Zebra']);
        User::factory()->create(['name' => 'Alpha']);
        User::factory()->create(['name' => 'Mango']);

        $this->getJson('/api/admin/users?sort=name&direction=asc')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Admin User')
            ->assertJsonPath('data.1.name', 'Alpha')
            ->assertJsonPath('data.2.name', 'Mango')
            ->assertJsonPath('data.3.name', 'Zebra');
    }

    public function test_admin_can_filter_users_by_joined_date_range(): void
    {
        $this->admin();

        $old = User::factory()->create();
        $old->forceFill(['created_at' => now()->subDays(30)])->save();

        $recent = User::factory()->create();
        $recent->forceFill(['created_at' => now()->subDays(2)])->save();

        User::factory()->count(2)->create();

        $this->getJson('/api/admin/users?date_from='.now()->subDays(7)->toDateString())
            ->assertOk();

        $this->getJson('/api/admin/users?date_from='.now()->subDays(7)->toDateString().'&date_to='.now()->toDateString())
            ->assertOk();
    }
}
