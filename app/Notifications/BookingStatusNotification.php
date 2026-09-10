<?php

namespace App\Notifications;

use App\Models\Booking;
use App\Support\BookingCalendar;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\HtmlString;

class BookingStatusNotification extends Notification
{
    use Queueable;

    public function __construct(public Booking $booking, public string $message) {}

    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $path = $notifiable->role === 'provider' ? '/provider/bookings' : '/customer/bookings';
        $this->booking->loadMissing(['provider.user', 'customer', 'service', 'payment']);
        $payment = $this->booking->payment;
        $calendar = app(BookingCalendar::class);
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

        try {
            $calendarLinks = $calendar->links($this->booking);
            $mail->line(new HtmlString(
                '<strong>Add this booking to your calendar:</strong> '
                .'<a href="'.e($calendarLinks['google']).'">Google Calendar</a>'
                .' &nbsp;|&nbsp; '
                .'<a href="'.e($calendarLinks['download']).'">Apple Calendar, Outlook or another app (.ics)</a>'
            ))
            ->attachData($calendar->contents($this->booking), $calendar->filename($this->booking), [
                'mime' => 'text/calendar; charset=UTF-8',
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Booking calendar attachment could not be generated; sending the email without it.', [
                'booking_id' => $this->booking->id,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
        }

        if ($isCustomerMessage) {
            $mail->line($notifiable->is_guest
                ? 'Create a customer account with this same email to track this booking, payments and future updates.'
                : 'Log in to your customer account to manage this booking and view updates.');
        }

        return $mail->action($actionLabel, $actionUrl);
    }

    public function toArray(object $notifiable): array
    {
        $path = $notifiable->role === 'provider' ? '/provider/bookings' : '/customer/bookings';

        return [
            'title' => 'Booking update',
            'message' => $this->message,
            'booking_id' => $this->booking->id,
            'status' => $this->booking->status,
            'action_url' => $path,
        ];
    }
}
