<?php

namespace App\Notifications\Concerns;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\URL;
use Symfony\Component\Mime\Email;

trait AddsNewsletterUnsubscribeFooter
{
    protected function addNewsletterUnsubscribeFooter(MailMessage $message, int $subscriberId): MailMessage
    {
        $unsubscribeUrl = URL::signedRoute('newsletter.unsubscribe', ['subscriber' => $subscriberId]);

        return $message
            ->line('You are receiving this email because you subscribed to BeautyPro HQ updates.')
            ->line("[Unsubscribe from BeautyPro HQ emails]({$unsubscribeUrl})")
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
}
