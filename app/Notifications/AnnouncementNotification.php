<?php

namespace App\Notifications;

use App\Models\Announcement;
use App\Models\NewsletterSubscriber;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;
use Symfony\Component\Mime\Email;

class AnnouncementNotification extends Notification
{
    use Queueable;

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
            $unsubscribeUrl = URL::signedRoute('newsletter.unsubscribe', ['subscriber' => $notifiable->id]);

            return $message
                ->action('Visit BeautyPro HQ', rtrim(config('app.frontend_url', config('app.url')), '/'))
                ->line('You are receiving this because you subscribed to BeautyPro HQ updates.')
                ->line('To stop receiving these emails, use the unsubscribe link below.')
                ->line($unsubscribeUrl)
                ->withSymfonyMessage(function (Email $email) use ($unsubscribeUrl): void {
                    $from = (string) config('mail.from.address');
                    $values = ['<'.$unsubscribeUrl.'>'];
                    if ($from !== '') {
                        $values[] = '<mailto:'.$from.'?subject=unsubscribe>';
                    }
                    $email->getHeaders()->addTextHeader('List-Unsubscribe', implode(', ', $values));
                    $email->getHeaders()->addTextHeader('Precedence', 'bulk');
                });
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
