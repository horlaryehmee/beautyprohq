<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ProviderClaimNotification extends Notification
{
    use Queueable;

    public function __construct(public int $providerId, public string $businessName, public string $token)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = rtrim((string) config('app.frontend_url', config('app.url')), '/').'/claim-account?'.http_build_query([
            'listing' => $this->providerId,
            'token' => $this->token,
        ]);

        return (new MailMessage)
            ->subject('Claim your BeautyPro HQ listing')
            ->greeting('Claim your listing')
            ->line("A BeautyPro HQ listing for {$this->businessName} was imported from Beautypreneur Hub.")
            ->line('Use this private link to set a password and access your provider dashboard. It expires in 60 minutes.')
            ->action('Claim listing', $url)
            ->line('If you did not request this, you can ignore this email.');
    }
}
