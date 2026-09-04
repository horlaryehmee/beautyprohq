<?php

namespace App\Notifications;

use App\Models\Announcement;
use App\Models\NewsletterSubscriber;
use App\Notifications\Concerns\AddsNewsletterUnsubscribeFooter;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class AnnouncementNotification extends Notification
{
    use AddsNewsletterUnsubscribeFooter, Queueable;

    public function __construct(public Announcement $announcement) {}

    public function via(object $notifiable): array
    {
        if ($notifiable instanceof NewsletterSubscriber) {
            return ['mail'];
        }

        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $message = (new MailMessage)
            ->subject($this->announcement->title)
            ->greeting('Hello '.($notifiable->name ?? 'there').',')
            ->line($this->announcement->message);

        if ($notifiable instanceof NewsletterSubscriber) {
            $message->action('Visit BeautyPro HQ', rtrim(config('app.frontend_url', config('app.url')), '/'));

            return $this->addNewsletterUnsubscribeFooter($message, (int) $notifiable->id);
        }

        return $message
            ->action('Open dashboard', rtrim(config('app.frontend_url', config('app.url')), '/').'/'.$notifiable->role);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->announcement->title,
            'message' => $this->announcement->message,
            'announcement_id' => $this->announcement->id,
        ];
    }
}
