<?php

namespace App\Notifications;

use App\Models\LiveChatConversation;
use App\Models\LiveChatMessage;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class LiveChatProviderMessageNotification extends Notification
{
    use Queueable;

    public function __construct(public LiveChatConversation $conversation, public LiveChatMessage $message) {}

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('New live chat message')
            ->greeting("Hello {$notifiable->name},")
            ->line("{$this->conversation->visitor_name} sent you a live chat message.")
            ->line((string) str($this->message->body)->limit(240))
            ->action('Open live chat inbox', rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/live-chat');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => 'New live chat message',
            'message' => "{$this->conversation->visitor_name}: ".((string) str($this->message->body)->limit(120)),
            'conversation_id' => $this->conversation->id,
            'provider_id' => $this->conversation->provider_id,
        ];
    }
}
