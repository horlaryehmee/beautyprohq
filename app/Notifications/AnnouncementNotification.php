<?php

namespace App\Notifications;

use App\Models\Announcement;
use App\Models\NewsletterSubscriber;
use App\Notifications\Concerns\AddsNewsletterUnsubscribeFooter;
use App\Support\AnnouncementTemplate;
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
            ->subject(AnnouncementTemplate::render($this->announcement->title, $notifiable))
            ->greeting('Hello '.($notifiable->name ?? 'there').',')
            ->line(AnnouncementTemplate::render($this->announcement->message, $notifiable));

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
            'title' => AnnouncementTemplate::render($this->announcement->title, $notifiable),
            'message' => AnnouncementTemplate::render($this->announcement->message, $notifiable),
            'announcement_id' => $this->announcement->id,
            'action_url' => '/'.($notifiable->role ?? 'customer'),
        ];
    }
}
