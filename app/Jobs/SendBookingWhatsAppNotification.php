<?php

namespace App\Jobs;

use App\Models\Booking;
use App\Services\BookingWhatsAppNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SendBookingWhatsAppNotification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [60, 300];

    public function __construct(public readonly int $bookingId, public readonly string $type) {}

    public function handle(BookingWhatsAppNotificationService $notifications): void
    {
        $booking = Booking::find($this->bookingId);
        if ($booking) {
            $sent = $notifications->send($booking, $this->type);
            if (! $sent && $notifications->lastError()) {
                throw new \RuntimeException($notifications->lastError());
            }
        }
    }
}
