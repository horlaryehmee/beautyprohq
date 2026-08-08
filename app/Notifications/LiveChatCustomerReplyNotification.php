<?php

namespace App\Notifications;

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

    public function toMail(object $notifiable): MailMessage
    {
        $providerName = $this->conversation->provider?->user?->name ?? 'your beauty professional';
        $url = $this->conversation->booking_id
            ? rtrim(config('app.frontend_url', config('app.url')), '/').'/customer/chats'
            : rtrim(config('app.frontend_url', config('app.url')), '/').'/providers/'.$this->conversation->provider_id;
        $mail = (new MailMessage)
            ->subject("New reply from {$providerName}")
            ->greeting("Hi {$this->conversation->visitor_name},");

        return $mail
            ->line("{$providerName} replied to your live chat message on BeautyPro HQ.")
            ->line((string) str($this->message->body)->limit(240))
            ->action($this->conversation->booking_id ? 'Open chat' : 'Open provider profile', $url)
            ->line('Please open live chat in your dashboard to respond.');
    }
}
