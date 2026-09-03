<?php

namespace App\Services;

use App\Models\LiveChatConversation;
use App\Models\LiveChatMessage;
use App\Models\User;
use App\Notifications\LiveChatProviderMessageNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

class LiveChatService
{
    /**
     * Append a customer/visitor message to an existing live chat conversation and
     * update the conversation's unread/status state. Notifies the provider.
     *
     * Used by the guest reply widget, the inbound email-reply webhook, and the
     * secure "reply by email" thread.
     */
    public function addVisitorMessage(LiveChatConversation $conversation, string $body, ?int $senderUserId = null, bool $notify = true): LiveChatMessage
    {
        $message = DB::transaction(function () use ($conversation, $body, $senderUserId): LiveChatMessage {
            $message = $conversation->messages()->create([
                'sender_user_id' => $senderUserId,
                'sender_type' => 'visitor',
                'body' => mb_substr($body, 0, 3000),
            ]);

            $conversation->forceFill([
                'status' => 'open',
                'provider_unread_count' => (int) $conversation->provider_unread_count + 1,
                'last_message_at' => now(),
                'closed_at' => null,
            ])->save();

            return $message;
        });

        if ($notify) {
            $this->notifyProvider($conversation, $message);
        }

        return $message;
    }

    private function notifyProvider(LiveChatConversation $conversation, LiveChatMessage $message): void
    {
        try {
            $conversation->loadMissing(['provider.user']);
            $providerUser = $conversation->provider?->user;
            if ($providerUser instanceof User) {
                $providerUser->notify(new LiveChatProviderMessageNotification($conversation, $message));
            }
        } catch (Throwable $exception) {
            Log::warning('Live chat provider notification failed.', [
                'conversation_id' => $conversation->id,
                'message_id' => $message->id,
                'provider_id' => $conversation->provider_id,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
