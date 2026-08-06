<?php

namespace App\Notifications;

use App\Models\ContactEnquiry;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ContactEnquiryConfirmation extends Notification
{
    use Queueable;

    public function __construct(public ContactEnquiry $enquiry)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('We received your BeautyPro HQ message')
            ->greeting("Hi {$this->enquiry->name},")
            ->line("Thanks for contacting BeautyPro HQ about {$this->enquiry->reason}.")
            ->line('Your message has been received and the team will review it.')
            ->action('Visit BeautyPro HQ', rtrim(config('app.frontend_url', config('app.url')), '/'))
            ->line('Keep this email as confirmation that your message was submitted.');
    }
}
