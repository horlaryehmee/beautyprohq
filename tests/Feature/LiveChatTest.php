<?php

namespace Tests\Feature;

use App\Models\CrmCustomer;
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
        $visitor = User::where('email', 'ada@example.com')->first();
        $this->assertNotNull($visitor);

        $crmLead = CrmCustomer::where('provider_id', $provider->id)->where('customer_id', $visitor->id)->first();
        $this->assertTrue($visitor->is_guest);
        $this->assertNotNull($crmLead);
        $this->assertSame('lead', $crmLead->stage);
        $this->assertSame('live_chat', $crmLead->source);
        $this->assertSame('open', $crmLead->support_status);
        $this->assertDatabaseHas('crm_activities', [
            'crm_customer_id' => $crmLead->id,
            'type' => 'chat',
            'title' => 'Live chat started',
            'status' => 'open',
        ]);

        Sanctum::actingAs($providerUser);
        $this->getJson('/api/provider/live-chat')
            ->assertOk()
            ->assertJsonPath('data.0.id', $conversationId)
            ->assertJsonPath('data.0.provider_unread_count', 1);

        $this->putJson("/api/provider/crm/{$visitor->id}", [
            'stage' => 'prospect',
            'priority' => 'high',
        ])->assertOk()
            ->assertJsonPath('data.stage', 'prospect')
            ->assertJsonPath('data.priority', 'high');

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
            'customer_id' => $visitor->id,
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

    public function test_provider_thread_messages_are_paged_and_scoped_to_one_conversation(): void
    {
        [$provider, $providerUser] = $this->paidProvider();
        $otherProvider = $this->paidProvider()[0];
        $conversation = LiveChatConversation::create([
            'provider_id' => $provider->id,
            'visitor_name' => 'Volume Visitor',
            'visitor_email' => 'volume@example.com',
            'visitor_token' => 'volume-token',
            'last_message_at' => now(),
        ]);
        $otherConversation = LiveChatConversation::create([
            'provider_id' => $otherProvider->id,
            'visitor_name' => 'Other Visitor',
            'visitor_email' => 'other@example.com',
            'visitor_token' => 'other-token',
            'last_message_at' => now(),
        ]);

        foreach (range(1, 125) as $index) {
            $conversation->messages()->create([
                'sender_type' => $index % 2 ? 'visitor' : 'provider',
                'body' => "Message {$index}",
            ]);
        }
        $otherConversation->messages()->create([
            'sender_type' => 'visitor',
            'body' => 'This should not appear',
        ]);

        Sanctum::actingAs($providerUser);
        $response = $this->getJson("/api/provider/live-chat/{$conversation->id}?per_page=25")
            ->assertOk()
            ->assertJsonCount(25, 'data.messages')
            ->assertJsonPath('data.message_page.has_older', true);

        $this->assertSame('Message 101', $response->json('data.messages.0.body'));
        $this->assertSame('Message 125', $response->json('data.messages.24.body'));

        $oldestId = $response->json('data.message_page.oldest_id');
        $this->getJson("/api/provider/live-chat/{$conversation->id}?before_id={$oldestId}&per_page=25")
            ->assertOk()
            ->assertJsonCount(25, 'data.messages')
            ->assertJsonPath('data.messages.0.body', 'Message 76')
            ->assertJsonMissing(['body' => 'This should not appear']);
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
            'account_approved_at' => now(),
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
