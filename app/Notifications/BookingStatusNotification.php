<?php

namespace App\Notifications;

use App\Models\Booking;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class BookingStatusNotification extends Notification
{
    use Queueable;

    public function __construct(public Booking $booking, public string $message) {}

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $path = $notifiable->role === 'provider' ? '/provider/bookings' : '/customer/bookings';

        return (new MailMessage)
            ->subject('BeautyPro HQ booking update')
            ->greeting("Hello {$notifiable->name},")
            ->line($this->message)
            ->line("Service: {$this->booking->service->name}")
            ->line('Date: '.$this->booking->date->format('M j, Y').' at '.$this->booking->time)
            ->action('View your bookings', rtrim(config('app.frontend_url', config('app.url')), '/').$path);
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => 'Booking update',
            'message' => $this->message,
            'booking_id' => $this->booking->id,
            'status' => $this->booking->status,
        ];
    }
}
