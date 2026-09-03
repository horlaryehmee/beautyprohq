<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HomeProOfWeekTest extends TestCase
{
    use RefreshDatabase;

    private function directoryEligibleProvider(string $name): ProviderProfile
    {
        $user = User::factory()->provider()->create(['name' => $name]);
        return ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => str($name)->slug().'-'.$user->id,
            'profession' => 'Artist',
            'is_listed' => true,
            'account_approved_at' => now(),
            'is_pro_of_week' => false,
        ]);
    }

    public function test_home_returns_the_ticked_pro_of_the_week_when_directory_eligible(): void
    {
        $pro = $this->directoryEligibleProvider('New Pro');
        $pro->update(['is_pro_of_week' => true]);

        $this->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('data.pro_of_the_week.id', $pro->id);
    }

    public function test_home_falls_back_to_featured_when_ticked_pro_is_not_directory_eligible(): void
    {
        // This pro is pro_of_week but NOT approved, so it is excluded from directory().
        $user = User::factory()->provider()->create(['name' => 'Unapproved Pro']);
        $notEligible = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'unapproved-pro',
            'profession' => 'Artist',
            'is_listed' => true,
            'account_approved_at' => null,
            'is_pro_of_week' => true,
        ]);

        $featured = $this->directoryEligibleProvider('Featured Pro');
        $featured->update(['verified' => true]);

        $this->getJson('/api/home')
            ->assertOk()
            ->assertJsonPath('data.pro_of_the_week.id', $featured->id);
    }
}
