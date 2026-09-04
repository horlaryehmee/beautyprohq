<?php

namespace App\Notifications;

use App\Notifications\Concerns\AddsNewsletterUnsubscribeFooter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ContentPublishedNewsletterNotification extends Notification implements ShouldQueue
{
    use AddsNewsletterUnsubscribeFooter, Queueable;

    public function __construct(
        private readonly int $subscriberId,
        private readonly string $subscriberName,
        private readonly string $contentType,
        private readonly string $title,
        private readonly string $summary,
        private readonly string $url,
    ) {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $type = str($this->contentType)->headline()->lower();
        $message = (new MailMessage)
            ->subject("New BeautyPro HQ {$type}: {$this->title}")
            ->greeting('Hello '.($this->subscriberName ?: 'there').',')
            ->line("A new {$type} has been published on BeautyPro HQ.")
            ->line($this->title)
            ->line($this->summary)
            ->action('Read the update', $this->url);

        return $this->addNewsletterUnsubscribeFooter($message, $this->subscriberId);
    }
}
