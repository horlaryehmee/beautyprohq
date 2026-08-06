<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

class BeautyProVerifyEmailNotification extends Notification
{
    use Queueable;

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $hash = sha1($notifiable->getEmailForVerification());
        $apiUrl = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes((int) config('auth.verification.expire', 60)),
            ['id' => $notifiable->getKey(), 'hash' => $hash]
        );
        $query = parse_url($apiUrl, PHP_URL_QUERY);
        $url = rtrim(config('app.frontend_url', config('app.url')), '/')."/verify-email/{$notifiable->getKey()}/{$hash}?{$query}";

        return (new MailMessage)
            ->subject('Verify your BeautyPro HQ email')
            ->greeting('Verify your email address')
            ->line('Confirm this email address to finish securing your BeautyPro HQ account.')
            ->action('Verify email', $url)
            ->line('If you did not create this account, you can ignore this email.');
    }
}
