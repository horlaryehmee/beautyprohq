<?php

namespace App\Notifications;

use App\Http\Controllers\Api\LiveChatInboundMailController;
use App\Models\LiveChatConversation;
use App\Models\LiveChatMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class LiveChatCustomerReplyNotification extends Notification
{
    use Queueable;

    public function __construct(public LiveChatConversation $conversation, public LiveChatMessage $message) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function replyTo(): string
    {
        return LiveChatInboundMailController::replyToAddress((int) $this->conversation->id);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $providerName = $this->conversation->provider?->user?->name ?? 'your beauty professional';
        $frontendBase = rtrim(config('app.frontend_url', config('app.url')), '/');
        $threadUrl = $frontendBase.'/chat/'.$this->conversation->id.'?token='.urlencode((string) $this->conversation->visitor_token);

        $mail = (new MailMessage)
            ->subject("New reply from {$providerName}")
            ->replyTo($this->replyTo(), 'BeautyPro HQ live chat')
            ->greeting("Hi {$this->conversation->visitor_name},");

        $mail
            ->line("{$providerName} replied to your live chat message on BeautyPro HQ.")
            ->line('')
            ->line('Their reply:')
            ->line('> '.(string) str($this->message->body)->limit(600))
            ->line('')
            ->line('Reply directly to this email, or tap below to continue the chat.')
            ->action('Reply to this chat', $threadUrl)
            ->line('If you no longer want chat updates, you can ignore this message.');

        return $mail;
    }
}

