<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProOfTheWeekTest extends TestCase
{
    use RefreshDatabase;

    private function providerUser(string $name): array
    {
        $user = User::factory()->provider()->create(['name' => $name]);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => str($name)->slug().'-'.$user->id,
            'profession' => 'Artist',
            'is_listed' => true,
            'is_pro_of_week' => false,
        ]);

        return [$user, $profile];
    }

    public function test_selecting_a_new_pro_of_week_untick_previous_one_via_update_provider(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        [$firstUser, $first] = $this->providerUser('First Pro');
        [$secondUser, $second] = $this->providerUser('Second Pro');

        // Set the first as pro of the week.
        $this->patchJson("/api/admin/providers/{$first->id}", ['is_pro_of_week' => true])
            ->assertOk();
        $this->assertTrue($first->fresh()->is_pro_of_week);

        // Now set the second - the first should be automatically unticked.
        $this->patchJson("/api/admin/providers/{$second->id}", ['is_pro_of_week' => true])
            ->assertOk();

        $this->assertTrue($second->fresh()->is_pro_of_week);
        $this->assertFalse($first->fresh()->is_pro_of_week);
    }

    public function test_selecting_a_new_pro_of_week_untick_previous_one_via_update_user(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        [$firstUser, $first] = $this->providerUser('First Pro');
        [$secondUser, $second] = $this->providerUser('Second Pro');

        $this->patchJson("/api/admin/users/{$firstUser->id}", [
            'provider_profile' => ['is_pro_of_week' => true],
        ])->assertOk();
        $this->assertTrue($first->fresh()->is_pro_of_week);

        $this->patchJson("/api/admin/users/{$secondUser->id}", [
            'provider_profile' => ['is_pro_of_week' => true],
        ])->assertOk();

        $this->assertTrue($second->fresh()->is_pro_of_week);
        $this->assertFalse($first->fresh()->is_pro_of_week);
    }

    public function test_unticking_current_pro_leaves_no_pro_of_week(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        [$firstUser, $first] = $this->providerUser('First Pro');

        $this->patchJson("/api/admin/providers/{$first->id}", ['is_pro_of_week' => true])
            ->assertOk();
        $this->assertTrue($first->fresh()->is_pro_of_week);

        $this->patchJson("/api/admin/providers/{$first->id}", ['is_pro_of_week' => false])
            ->assertOk();

        $this->assertFalse($first->fresh()->is_pro_of_week);
    }
}
