<?php

namespace App\Jobs;

use App\Models\Booking;
use App\Services\BookingWhatsAppNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendBookingWhatsAppNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public readonly int $bookingId, public readonly string $type) {}

    public function handle(BookingWhatsAppNotificationService $notifications): void
    {
        $booking = Booking::find($this->bookingId);
        if ($booking) {
            $notifications->send($booking, $this->type);
        }
    }

    public function failed(?Throwable $exception): void
    {
        Log::error('Booking WhatsApp notification job failed.', [
            'booking_id' => $this->bookingId,
            'notification_type' => $this->type,
            'exception' => $exception?->getMessage(),
        ]);
    }
}
