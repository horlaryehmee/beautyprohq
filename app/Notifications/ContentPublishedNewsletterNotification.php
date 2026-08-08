<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;
use Symfony\Component\Mime\Email;

class ContentPublishedNewsletterNotification extends Notification implements ShouldQueue
{
    use Queueable;

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
        $unsubscribeUrl = URL::signedRoute('newsletter.unsubscribe', ['subscriber' => $this->subscriberId]);

        return (new MailMessage)
            ->subject("New BeautyPro HQ {$type}: {$this->title}")
            ->greeting('Hello '.($this->subscriberName ?: 'there').',')
            ->line("A new {$type} has been published on BeautyPro HQ.")
            ->line($this->title)
            ->line($this->summary)
            ->action('Read the update', $this->url)
            ->line('You are receiving this because you subscribed to BeautyPro HQ updates.')
            ->line('To stop receiving these emails, use the unsubscribe link below.')
            ->line($unsubscribeUrl)
            ->withSymfonyMessage(function (Email $message) use ($unsubscribeUrl): void {
                $from = (string) config('mail.from.address');
                $values = ['<'.$unsubscribeUrl.'>'];
                if ($from !== '') {
                    $values[] = '<mailto:'.$from.'?subject=unsubscribe>';
                }
                $message->getHeaders()->addTextHeader('List-Unsubscribe', implode(', ', $values));
                $message->getHeaders()->addTextHeader('Precedence', 'bulk');
            });
    }
}
