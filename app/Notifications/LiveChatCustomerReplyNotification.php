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
        $url = rtrim(config('app.frontend_url', config('app.url')), '/').'/providers/'.$this->conversation->provider_id;

        return (new MailMessage)
            ->subject("New reply from {$providerName}")
            ->greeting("Hi {$this->conversation->visitor_name},")
            ->line("{$providerName} replied to your live chat message on BeautyPro HQ.")
            ->line((string) str($this->message->body)->limit(240))
            ->action('Open provider profile', $url)
            ->line('Reply from the live chat widget on the provider profile.');
    }
}
