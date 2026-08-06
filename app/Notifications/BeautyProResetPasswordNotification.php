<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class BeautyProResetPasswordNotification extends Notification
{
    use Queueable;

    public function __construct(public string $token)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim(config('app.frontend_url', config('app.url')), '/').'/reset-password?'.http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);

        $expire = (int) config('auth.passwords.'.config('auth.defaults.passwords').'.expire', 60);

        return (new MailMessage)
            ->subject('Reset your BeautyPro HQ password')
            ->greeting('Reset your password')
            ->line('We received a request to reset the password for your BeautyPro HQ account.')
            ->line("This secure link expires in {$expire} minutes.")
            ->action('Reset password', $url)
            ->line('If you did not request a password reset, you can ignore this email.');
    }
}
