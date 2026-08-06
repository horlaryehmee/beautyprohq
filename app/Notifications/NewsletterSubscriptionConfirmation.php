<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class NewsletterSubscriptionConfirmation extends Notification
{
    use Queueable;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('You are on the BeautyPro HQ list')
            ->greeting('You are on the list.')
            ->line('Thanks for subscribing to BeautyPro HQ updates.')
            ->line('We will send curated platform news, opportunities, events and beauty business updates to this email address.')
            ->action('Explore BeautyPro HQ', rtrim(config('app.frontend_url', config('app.url')), '/'))
            ->line('You can ignore this message if you did not request this subscription.');
    }
}
