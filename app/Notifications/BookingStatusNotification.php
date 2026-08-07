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
        $this->booking->loadMissing(['provider.user', 'customer', 'service', 'payment']);
        $payment = $this->booking->payment;

        return (new MailMessage)
            ->subject('BeautyPro HQ booking update')
            ->greeting("Hello {$notifiable->name},")
            ->line($this->message)
            ->line("Service: {$this->booking->service?->name}")
            ->line('Provider: '.$this->booking->provider?->user?->name)
            ->line('Customer: '.$this->booking->customer?->name)
            ->line('Customer email: '.$this->booking->customer?->email)
            ->line('Customer phone: '.($this->booking->customer?->phone ?: 'Not provided'))
            ->line('Date: '.$this->booking->date->format('M j, Y').' at '.substr((string) $this->booking->time, 0, 5))
            ->line('Duration: '.($this->booking->service?->duration_minutes ?? 0).' minutes')
            ->line('Payment: '.($payment ? strtoupper((string) $payment->currency).' '.number_format((float) $payment->amount, 2).' via '.ucfirst((string) ($payment->gateway ?? 'gateway')).' - '.ucfirst((string) $payment->status) : 'Not available'))
            ->line('Reference: '.($payment?->reference ?: 'Not available'))
            ->line('Notes: '.($this->booking->notes ?: 'None'))
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
