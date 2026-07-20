<?php

namespace Tests\Feature;

use App\Models\Availability;
use App\Models\ProviderProfile;
use App\Models\User;
use App\Models\VerificationRequest;
use Carbon\Carbon;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BackendMvpTest extends TestCase
{
    use RefreshDatabase;

    public function test_provider_registration_creates_profile_and_token(): void
    {
        Notification::fake();

        $response = $this->postJson('/api/auth/register', [
            'name' => 'Demo Artist',
            'email' => 'artist@example.test',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
            'role' => 'provider',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.user.role', 'provider')
            ->assertJsonPath('data.user.provider_profile.profession', 'Beauty Professional')
            ->assertJsonStructure(['data' => ['token']]);
        $this->assertDatabaseHas('provider_profiles', ['slug' => 'demo-artist']);
        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_login_me_and_role_protection_work_with_sanctum(): void
    {
        $customer = User::factory()->create(['email' => 'customer@example.test', 'password' => 'Password123']);

        $login = $this->postJson('/api/auth/login', ['email' => $customer->email, 'password' => 'Password123']);
        $token = $login->assertOk()->json('data.token');

        $this->withToken($token)->getJson('/api/auth/me')->assertOk()->assertJsonPath('data.id', $customer->id);
        $this->withToken($token)->getJson('/api/provider/dashboard')->assertForbidden();
    }

    public function test_password_reset_and_signed_email_verification_work(): void
    {
        $user = User::factory()->unverified()->create(['password' => 'OldPassword123']);
        $token = Password::createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email, 'token' => $token,
            'password' => 'NewPassword123', 'password_confirmation' => 'NewPassword123',
        ])->assertOk();

        $mail = (new VerifyEmail)->toMail($user);
        $this->assertStringContainsString("/verify-email/{$user->id}/", $mail->actionUrl);
        $query = parse_url($mail->actionUrl, PHP_URL_QUERY);
        $apiUrl = url("/api/email/verify/{$user->id}/".sha1($user->email)).'?'.$query;
        $this->getJson($apiUrl)->assertOk()->assertJsonPath('data.id', $user->id);
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    public function test_directory_filters_and_profile_slug_are_public(): void
    {
        [$provider] = $this->provider('Maya Beauty', true, 'Lagos');
        $provider->services()->create(['name' => 'Soft Glam', 'category' => 'Makeup', 'service_type' => 'in_person', 'price' => 25000, 'duration_minutes' => 60]);

        $this->getJson('/api/providers?search=Soft&verified=1&location=Lagos')
            ->assertOk()->assertJsonPath('data.0.slug', $provider->slug)->assertJsonPath('meta.total', 1);
        $this->getJson('/api/providers/'.$provider->slug)
            ->assertOk()->assertJsonPath('data.user.name', 'Maya Beauty')->assertJsonCount(1, 'data.services');
    }

    public function test_customer_can_book_available_slot_and_provider_can_complete_it(): void
    {
        Notification::fake();
        [$provider, $providerUser] = $this->provider('Booked Beauty', true);
        $service = $provider->services()->create(['name' => 'Facial', 'category' => 'Skincare', 'service_type' => 'in_person', 'price' => 20000, 'duration_minutes' => 60]);
        $date = Carbon::tomorrow();
        if ($date->dayOfWeek === 0) {
            $date->addDay();
        }
        Availability::create(['provider_id' => $provider->id, 'day_of_week' => $date->dayOfWeek, 'start_time' => '09:00', 'end_time' => '17:00']);
        $customer = User::factory()->create();

        Sanctum::actingAs($customer);
        $bookingId = $this->postJson('/api/bookings', [
            'provider_id' => $provider->id, 'service_id' => $service->id,
            'date' => $date->toDateString(), 'time' => '10:00',
        ])->assertCreated()->assertJsonPath('data.status', 'pending')->json('data.id');
        $this->assertDatabaseHas('payments', ['booking_id' => $bookingId, 'amount' => 20000]);

        Sanctum::actingAs($providerUser);
        $this->patchJson("/api/provider/bookings/{$bookingId}/status", ['status' => 'confirmed'])->assertOk();
        $this->patchJson("/api/provider/bookings/{$bookingId}/status", ['status' => 'completed'])->assertOk();
        $this->assertDatabaseHas('loyalties', ['provider_id' => $provider->id, 'customer_id' => $customer->id, 'points' => 10]);
        $this->assertDatabaseHas('crm_customers', ['provider_id' => $provider->id, 'customer_id' => $customer->id]);
    }

    public function test_booking_rejects_unavailable_or_conflicting_time(): void
    {
        [$provider] = $this->provider('Busy Artist');
        $service = $provider->services()->create(['name' => 'Makeup', 'price' => 10000, 'duration_minutes' => 60]);
        $date = Carbon::tomorrow();
        Availability::create(['provider_id' => $provider->id, 'day_of_week' => $date->dayOfWeek, 'start_time' => '09:00', 'end_time' => '12:00']);
        $customer = User::factory()->create();
        Sanctum::actingAs($customer);

        $this->postJson('/api/bookings', ['provider_id' => $provider->id, 'service_id' => $service->id, 'date' => $date->toDateString(), 'time' => '16:00'])->assertUnprocessable();
        $this->postJson('/api/bookings', ['provider_id' => $provider->id, 'service_id' => $service->id, 'date' => $date->toDateString(), 'time' => '10:00'])->assertCreated();
        $this->postJson('/api/bookings', ['provider_id' => $provider->id, 'service_id' => $service->id, 'date' => $date->toDateString(), 'time' => '10:30'])->assertConflict();
    }

    public function test_admin_can_approve_verification_and_provider_access_is_scoped(): void
    {
        Notification::fake();
        [$provider] = $this->provider('Verify Me', false);
        $verification = VerificationRequest::create(['provider_id' => $provider->id, 'portfolio_links' => ['https://example.com/work'], 'status' => 'pending']);
        $admin = User::factory()->admin()->create();

        Sanctum::actingAs($admin);
        $this->patchJson('/api/admin/verifications/'.$verification->id, ['status' => 'approved', 'admin_notes' => 'Portfolio confirmed.'])
            ->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertTrue($provider->fresh()->verified);
    }

    public function test_provider_can_manage_services_schedule_and_payment_account(): void
    {
        [$provider, $user] = $this->provider('Studio Owner', true);
        Sanctum::actingAs($user);

        $this->postJson('/api/provider/services', [
            'name' => 'Braiding', 'category' => 'Hair',
            'price' => 30000, 'duration_minutes' => 120,
        ])->assertCreated()->assertJsonPath('data.name', 'Braiding')->assertJsonPath('data.service_type', 'in_person');

        $this->putJson('/api/provider/availability', ['slots' => [
            ['day_of_week' => 1, 'start_time' => '09:00', 'end_time' => '17:00'],
            ['day_of_week' => 2, 'start_time' => '10:00', 'end_time' => '18:00'],
        ]])->assertOk()->assertJsonCount(2, 'data');

        $this->putJson('/api/provider/payment-accounts', [
            'gateway' => 'paystack', 'account_name' => 'Studio Owner Ltd',
            'account_identifier' => 'ACCT_demo', 'public_key' => 'pk_test_demo', 'enabled' => true,
        ])->assertOk()->assertJsonPath('data.enabled', true);
        $this->assertDatabaseHas('payment_accounts', ['provider_id' => $provider->id, 'gateway' => 'paystack', 'account_identifier' => 'ACCT_demo']);
    }

    public function test_customer_saved_provider_actions_are_idempotent(): void
    {
        [$provider] = $this->provider('Saveable Pro', true);
        $customer = User::factory()->create();
        Sanctum::actingAs($customer);

        $this->postJson('/api/customer/saved-providers/'.$provider->id)->assertCreated();
        $this->postJson('/api/customer/saved-providers/'.$provider->id)->assertCreated();
        $this->assertDatabaseCount('saved_providers', 1);
        $this->deleteJson('/api/customer/saved-providers/'.$provider->id)->assertOk();
        $this->assertDatabaseCount('saved_providers', 0);
    }

    public function test_admin_content_status_alias_publishes_real_content(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $articleId = $this->postJson('/api/admin/news', [
            'title' => 'Industry update', 'content' => 'A detailed industry update.', 'status' => 'published',
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('news', ['id' => $articleId]);
        $this->getJson('/api/news')->assertOk()->assertJsonPath('data.0.id', $articleId);
    }

    private function provider(string $name, bool $verified = false, string $location = 'Abuja'): array
    {
        $user = User::factory()->provider()->create(['name' => $name]);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => str($name)->slug().'-'.$user->id,
            'profession' => 'Beauty Professional',
            'location' => $location,
            'verified' => $verified,
        ]);

        return [$profile, $user];
    }
}
