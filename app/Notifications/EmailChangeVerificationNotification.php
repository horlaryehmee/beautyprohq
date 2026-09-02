<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\URL;

class EmailChangeVerificationNotification extends Notification
{
    use Queueable;

    public function __construct(
        public int $userId,
        public string $name,
        public string $token,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = URL::temporarySignedRoute(
            'email-change.verify',
            now()->addMinutes(60),
            ['user' => $this->userId, 'token' => $this->token],
        );

        return (new MailMessage)
            ->subject('Confirm your new BeautyPro HQ login email')
            ->greeting("Hello {$this->name},")
            ->line('Confirm this address before it becomes the login email for your BeautyPro HQ account.')
            ->action('Confirm new login email', $url)
            ->line('This link expires in 60 minutes. If you did not request this change, do not use the link and secure your account.');
    }
}
