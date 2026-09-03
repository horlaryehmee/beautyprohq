<?php

namespace Tests\Feature;

use App\Models\ProviderProfile;
use App\Models\SupportTicket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProviderSupportTest extends TestCase
{
    use RefreshDatabase;

    public function test_provider_can_open_and_follow_a_private_support_request(): void
    {
        Notification::fake();
        [$provider] = $this->provider('Supported Provider');
        Sanctum::actingAs($provider);

        $ticket = $this->postJson('/api/provider/support', [
            'subject' => 'I need help with my booking settings',
            'category' => 'technical',
            'message' => 'My settings screen does not save the booking preference I selected.',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.messages.0.sender_role', 'provider')
            ->json('data');

        $this->getJson('/api/provider/support')
            ->assertOk()
            ->assertJsonPath('data.0.id', $ticket['id']);
        $this->assertDatabaseHas('support_messages', [
            'support_ticket_id' => $ticket['id'],
            'sender_id' => $provider->id,
            'sender_role' => 'provider',
        ]);
    }

    public function test_provider_cannot_read_or_reply_to_another_providers_request(): void
    {
        [$owner] = $this->provider('Ticket Owner');
        [$other] = $this->provider('Other Provider');
        $ticket = SupportTicket::create([
            'provider_id' => $owner->providerProfile->id,
            'requester_id' => $owner->id,
            'subject' => 'Private support request',
            'category' => 'general',
            'status' => 'open',
            'priority' => 'normal',
            'last_message_at' => now(),
        ]);

        Sanctum::actingAs($other);
        $this->getJson("/api/provider/support/{$ticket->id}")->assertNotFound();
        $this->postJson("/api/provider/support/{$ticket->id}/messages", ['message' => 'I should not be able to post here.'])->assertNotFound();
    }

    public function test_admin_can_reply_and_provider_sees_the_response(): void
    {
        Notification::fake();
        [$provider] = $this->provider('Reply Provider');
        $ticket = SupportTicket::create([
            'provider_id' => $provider->providerProfile->id,
            'requester_id' => $provider->id,
            'subject' => 'Billing clarification',
            'category' => 'billing',
            'status' => 'open',
            'priority' => 'high',
            'last_message_at' => now(),
        ]);
        $ticket->messages()->create([
            'sender_id' => $provider->id,
            'sender_role' => 'provider',
            'body' => 'Please clarify my latest subscription charge.',
        ]);
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/support')->assertOk()->assertJsonPath('data.0.id', $ticket->id);
        $this->postJson("/api/admin/support/{$ticket->id}/messages", [
            'message' => 'We have checked the charge and sent the details to your account.',
            'status' => 'resolved',
        ])->assertOk()
            ->assertJsonPath('data.status', 'resolved');

        Sanctum::actingAs($provider);
        $this->getJson("/api/provider/support/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.status', 'resolved')
            ->assertJsonPath('data.messages.1.sender_role', 'admin');
    }

    private function provider(string $name): array
    {
        $user = User::factory()->create([
            'name' => $name,
            'role' => 'provider',
            'email_verified_at' => now(),
        ]);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => str($name)->slug()->value(),
            'profession' => 'Beauty Professional',
            'verified' => true,
            'account_approved_at' => now(),
        ]);

        return [$user, $profile];
    }
}
