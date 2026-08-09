<?php

namespace App\Notifications;

use App\Models\ContactEnquiry;
use App\Models\ProviderProfile;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ProviderContactEnquiryNotification extends Notification
{
    use Queueable;

    public function __construct(
        public ProviderProfile $provider,
        public ContactEnquiry $enquiry
    ) {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $profileUrl = rtrim(config('app.frontend_url', config('app.url')), '/').'/providers/'.$this->provider->slug;
        $mail = (new MailMessage)
            ->subject('New enquiry from your BeautyPro HQ profile')
            ->replyTo($this->enquiry->email, $this->enquiry->name)
            ->greeting('Hi '.$this->provider->user->name.',')
            ->line($this->enquiry->name.' sent you a message from your public profile.')
            ->line('Email: '.$this->enquiry->email);

        if ($this->enquiry->phone) {
            $mail->line('Phone: '.$this->enquiry->phone);
        }

        return $mail
            ->line('Message:')
            ->line($this->enquiry->message)
            ->action('View your profile', $profileUrl)
            ->line('Reply directly to this email to contact the sender.');
    }
}
