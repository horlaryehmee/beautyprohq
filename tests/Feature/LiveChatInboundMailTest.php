<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\LiveChatInboundMailController;
use App\Models\LiveChatConversation;
use App\Models\ProviderProfile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class LiveChatInboundMailTest extends TestCase
{
    use RefreshDatabase;

    private string $secret = 'test-inbound-secret';

    protected function setUp(): void
    {
        parent::setUp();
        Config::set('services.live_chat.inbound_secret', $this->secret);
        Config::set('app.mail_reply_domain', 'chat.example.com');
    }

    private function conversation(): LiveChatConversation
    {
        $provider = User::factory()->provider()->create();
        ProviderProfile::create(['user_id' => $provider->id, 'slug' => 'pro-'.$provider->id, 'profession' => 'Artist']);

        return LiveChatConversation::create([
            'provider_id' => $provider->providerProfile->id,
            'visitor_name' => 'Amara',
            'visitor_email' => 'amara@example.test',
            'visitor_token' => 'visitor-token-123',
            'status' => 'open',
            'provider_unread_count' => 0,
            'last_message_at' => now(),
        ]);
    }

    public function test_inbound_email_reply_posts_a_visitor_message(): void
    {
        Notification::fake();
        $conversation = $this->conversation();
        $recipient = LiveChatInboundMailController::replyToAddress((int) $conversation->id);

        $this->postJson('/api/live-chat/mail/reply', [
            'recipient' => $recipient,
            'token' => $this->secret,
            'text' => 'Yes please, I am available on Friday.',
        ])->assertStatus(201)
            ->assertJsonPath('message', 'Reply added to live chat.');

        $this->assertDatabaseHas('live_chat_messages', [
            'conversation_id' => $conversation->id,
            'sender_type' => 'visitor',
            'body' => 'Yes please, I am available on Friday.',
        ]);

        $this->assertSame(1, $conversation->fresh()->provider_unread_count);
    }

    public function test_inbound_email_reply_rejects_bad_signature(): void
    {
        $conversation = $this->conversation();
        $recipient = LiveChatInboundMailController::replyToAddress((int) $conversation->id);

        // Tamper the signature by using the wrong secret.
        $this->postJson('/api/live-chat/mail/reply', [
            'recipient' => $recipient,
            'token' => 'wrong-secret',
            'text' => 'Should not post.',
        ])->assertStatus(403);
    }

    public function test_inbound_email_reply_rejects_when_not_configured(): void
    {
        Config::set('services.live_chat.inbound_secret', null);
        $conversation = $this->conversation();
        $recipient = LiveChatInboundMailController::replyToAddress((int) $conversation->id);

        $this->postJson('/api/live-chat/mail/reply', [
            'recipient' => $recipient,
            'token' => $this->secret,
            'text' => 'Should fail.',
        ])->assertStatus(403);
    }

    public function test_reply_to_address_round_trips(): void
    {
        $conversation = $this->conversation();
        $address = LiveChatInboundMailController::replyToAddress((int) $conversation->id);
        $this->assertStringStartsWith('chat-'.$conversation->id.'-', $address);
        $this->assertStringEndsWith('@chat.example.com', $address);
    }
}
