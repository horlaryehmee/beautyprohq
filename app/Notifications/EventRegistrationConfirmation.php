<?php

namespace App\Notifications;

use App\Models\Event;
use App\Models\EventRegistration;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class EventRegistrationConfirmation extends Notification
{
    use Queueable;

    public function __construct(public Event $event, public EventRegistration $registration)
    {
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject("Registration confirmed: {$this->event->title}")
            ->greeting("Hi {$this->registration->name},")
            ->line("Your registration for {$this->event->title} has been received.")
            ->line('Date: '.$this->event->date->format('j M Y, g:ia'))
            ->line("Location: {$this->event->location}")
            ->action('View event details', rtrim(config('app.frontend_url', config('app.url')), '/').'/news-events')
            ->line('We will contact you if there are any updates before the event.');
    }
}
