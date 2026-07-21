<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class TwoFactorCodeNotification extends Notification
{
    use Queueable;

    public function __construct(public string $code, public string $purpose = 'login')
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $subject = $this->purpose === 'enable'
            ? 'Confirm your BeautyPro HQ two-factor authentication'
            : 'Your BeautyPro HQ login code';

        return (new MailMessage)
            ->subject($subject)
            ->line('Use this code to continue:')
            ->line($this->code)
            ->line('This code expires in 10 minutes.');
    }
}
