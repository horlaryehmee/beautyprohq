<?php

namespace Tests\Feature;

use App\Models\LiveChatConversation;
use App\Models\ProviderProfile;
use App\Models\Subscription;
use App\Models\User;
use App\Notifications\LiveChatCustomerReplyNotification;
use App\Notifications\LiveChatProviderMessageNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class LiveChatTest extends TestCase
{
    use RefreshDatabase;

    public function test_visitor_and_paid_provider_can_exchange_live_chat_messages(): void
    {
        Notification::fake();
        [$provider, $providerUser] = $this->paidProvider();

        $start = $this->postJson("/api/providers/{$provider->id}/chat/conversations", [
            'name' => 'Ada Customer',
            'email' => 'ada@example.com',
            'message' => 'Do you have bridal makeup slots this weekend?',
        ])->assertCreated()
            ->assertJsonPath('data.visitor_name', 'Ada Customer')
            ->assertJsonPath('data.messages.0.sender_type', 'visitor');

        $conversationId = $start->json('data.id');
        $visitorToken = $start->json('data.visitor_token');
        Notification::assertSentTo($providerUser, LiveChatProviderMessageNotification::class);

        Sanctum::actingAs($providerUser);
        $this->getJson('/api/provider/live-chat')
            ->assertOk()
            ->assertJsonPath('data.0.id', $conversationId)
            ->assertJsonPath('data.0.provider_unread_count', 1);

        $this->getJson("/api/provider/live-chat/{$conversationId}")
            ->assertOk()
            ->assertJsonPath('data.provider_unread_count', 0);

        $this->postJson("/api/provider/live-chat/{$conversationId}/messages", [
            'message' => 'Yes, I have Saturday afternoon available.',
        ])->assertCreated()
            ->assertJsonPath('data.sender_type', 'provider');
        Notification::assertSentOnDemand(LiveChatCustomerReplyNotification::class);

        $this->getJson("/api/live-chat/conversations/{$conversationId}?visitor_token={$visitorToken}")
            ->assertOk()
            ->assertJsonPath('data.visitor_unread_count', 0)
            ->assertJsonPath('data.messages.1.body', 'Yes, I have Saturday afternoon available.');

        $this->assertDatabaseHas('live_chat_conversations', [
            'id' => $conversationId,
            'provider_id' => $provider->id,
            'visitor_email' => 'ada@example.com',
        ]);
    }

    public function test_visitor_token_is_required_to_read_public_conversation(): void
    {
        [$provider] = $this->paidProvider();
        $conversation = LiveChatConversation::create([
            'provider_id' => $provider->id,
            'visitor_name' => 'Private Visitor',
            'visitor_email' => 'private@example.com',
            'visitor_token' => 'secret-token',
            'last_message_at' => now(),
        ]);

        $this->getJson("/api/live-chat/conversations/{$conversation->id}?visitor_token=wrong")
            ->assertForbidden();
    }

    private function paidProvider(): array
    {
        $user = User::factory()->provider()->create(['name' => 'Pro Artist']);
        $profile = ProviderProfile::create([
            'user_id' => $user->id,
            'slug' => 'pro-artist-'.$user->id,
            'profession' => 'Makeup Artist',
            'location' => 'Lagos',
            'verified' => true,
            'is_listed' => true,
        ]);
        Subscription::create([
            'user_id' => $user->id,
            'plan' => 'pro',
            'status' => 'active',
            'amount' => 10000,
            'currency' => 'NGN',
            'starts_at' => now(),
            'renews_at' => now()->addMonth(),
        ]);

        return [$profile, $user];
    }
}
