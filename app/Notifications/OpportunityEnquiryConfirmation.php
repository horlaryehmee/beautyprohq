<?php

namespace App\Notifications;

use App\Models\Opportunity;
use App\Models\OpportunityEnquiry;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class OpportunityEnquiryConfirmation extends Notification
{
    use Queueable;

    public function __construct(public Opportunity $opportunity, public OpportunityEnquiry $enquiry)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)
            ->subject("Enquiry received: {$this->opportunity->title}")
            ->greeting("Hi {$this->enquiry->name},")
            ->line("We received your enquiry for {$this->opportunity->title}.")
            ->line('The BeautyPro HQ team will review it and follow up where needed.');

        if ($this->opportunity->deadline) {
            $mail->line('Deadline: '.$this->opportunity->deadline->format('j M Y'));
        }

        return $mail
            ->action('View opportunities', rtrim(config('app.frontend_url', config('app.url')), '/').'/opportunities')
            ->line('Keep this email as confirmation that your enquiry was submitted.');
    }
}
