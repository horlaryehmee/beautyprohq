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
        $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');
        $isCustomerMessage = $notifiable->role === 'customer' && (int) $notifiable->id === (int) $this->booking->customer_id;
        $actionLabel = 'View your bookings';
        $actionUrl = $frontendUrl.$path;

        if ($isCustomerMessage && $notifiable->is_guest) {
            $actionLabel = 'Create your account';
            $actionUrl = $frontendUrl.'/register?'.http_build_query([
                'role' => 'customer',
                'email' => $notifiable->email,
            ]);
        }

        $mail = (new MailMessage)
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
            ->line('Notes: '.($this->booking->notes ?: 'None'));

        if ($isCustomerMessage) {
            $mail->line($notifiable->is_guest
                ? 'Create a customer account with this same email to track this booking, payments and future updates.'
                : 'Log in to your customer account to manage this booking and view updates.');
        }

        return $mail->action($actionLabel, $actionUrl);
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
