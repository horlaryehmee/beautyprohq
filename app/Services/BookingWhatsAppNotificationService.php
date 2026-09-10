<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Booking;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class BookingWhatsAppNotificationService
{
    public const PROVIDER_BOOKING = 'provider_booking';

    public const CLIENT_CONFIRMATION = 'client_confirmation';

    public const CLIENT_REMINDER = 'client_reminder';

    public function __construct(private readonly TwilioWhatsAppService $twilio) {}

    public function send(Booking $booking, string $type): bool
    {
        $booking->loadMissing(['provider.user', 'customer', 'service', 'payment']);

        if (! $this->automatedNotificationsEnabled()) {
            Log::notice('Booking WhatsApp notification was skipped because automated notifications are paused.', [
                'booking_id' => $booking->id,
                'notification_type' => $type,
            ]);

            return false;
        }

        return match ($type) {
            self::PROVIDER_BOOKING => $this->sendProviderBooking($booking),
            self::CLIENT_CONFIRMATION => $this->sendClientConfirmation($booking),
            self::CLIENT_REMINDER => $this->sendClientReminder($booking),
            default => false,
        };
    }

    public function automatedNotificationsEnabled(): bool
    {
        return AppSetting::getValue('features.provider_whatsapp_notifications', '0') === '1';
    }

    public function sendTest(string $phone, string $type): bool
    {
        $sid = $this->templateSid($type);
        if (! $sid) {
            return false;
        }

        return $this->twilio->sendTemplate($phone, $sid, $this->sampleVariables($type));
    }

    public function templateSid(string $type): ?string
    {
        $key = match ($type) {
            self::PROVIDER_BOOKING => 'provider_booking_content_sid',
            self::CLIENT_CONFIRMATION => 'client_confirmation_content_sid',
            self::CLIENT_REMINDER => 'client_reminder_content_sid',
            default => null,
        };

        if (! $key) {
            return null;
        }

        $legacy = $type === self::PROVIDER_BOOKING ? AppSetting::getValue('twilio.content_sid') : null;

        return AppSetting::getValue("twilio.{$key}") ?: $legacy ?: config("services.twilio.{$key}");
    }

    public function reminderHoursBefore(): int
    {
        return min(168, max(1, (int) (AppSetting::getValue('twilio.reminder_hours_before') ?: config('services.twilio.reminder_hours_before', 24))));
    }

    public function reminderIsDue(Booking $booking, ?Carbon $now = null): bool
    {
        if ($booking->status !== 'confirmed' || $booking->customer_whatsapp_reminded_at) {
            return false;
        }

        $timezone = $booking->provider?->timezone ?: config('app.timezone');
        $appointment = Carbon::createFromFormat(
            'Y-m-d H:i:s',
            $booking->date?->format('Y-m-d').' '.$this->normalizedTime($booking),
            $timezone,
        );
        $localNow = ($now ?: now())->copy()->setTimezone($timezone);

        return $appointment->isFuture()
            && $appointment->lessThanOrEqualTo($localNow->copy()->addHours($this->reminderHoursBefore()));
    }

    public function lastError(): ?string
    {
        return $this->twilio->lastError();
    }

    private function sendProviderBooking(Booking $booking): bool
    {
        $provider = $booking->provider;
        if (! $provider?->whatsapp_notifications_enabled
            || blank($provider->whatsapp_number)) {
            Log::warning('Provider booking WhatsApp notification was skipped because delivery is not enabled for the recipient.', [
                'booking_id' => $booking->id,
                'provider_id' => $provider?->id,
                'provider_enabled' => (bool) $provider?->whatsapp_notifications_enabled,
                'recipient_configured' => filled($provider?->whatsapp_number),
            ]);

            return false;
        }

        return $this->sendOnce(
            $booking,
            'provider_whatsapp_notified_at',
            $provider->whatsapp_number,
            self::PROVIDER_BOOKING,
            [
                '1' => $provider->user?->name ?: 'Beauty Pro',
                '2' => $booking->customer?->name ?: 'A client',
                '3' => $booking->service?->name ?: 'Beauty service',
                '4' => $booking->date?->format('j F Y') ?: 'Date pending',
                '5' => $this->formattedTime($booking),
                '6' => $this->dashboardUrl('provider'),
            ],
        );
    }

    private function sendClientConfirmation(Booking $booking): bool
    {
        if ($booking->status !== 'confirmed' || $booking->payment?->status !== 'paid' || blank($booking->customer?->phone)) {
            return false;
        }

        return $this->sendOnce(
            $booking,
            'customer_whatsapp_confirmed_at',
            $booking->customer->phone,
            self::CLIENT_CONFIRMATION,
            [
                '1' => $booking->customer->name ?: 'there',
                '2' => $booking->provider?->user?->name ?: 'your Beauty Pro',
                '3' => $booking->service?->name ?: 'Beauty service',
                '4' => $booking->date?->format('j F Y') ?: 'Date pending',
                '5' => $this->formattedTime($booking),
                '6' => $this->dashboardUrl('customer'),
            ],
        );
    }

    private function sendClientReminder(Booking $booking): bool
    {
        if (! $this->reminderIsDue($booking) || blank($booking->customer?->phone)) {
            return false;
        }

        return $this->sendOnce(
            $booking,
            'customer_whatsapp_reminded_at',
            $booking->customer->phone,
            self::CLIENT_REMINDER,
            [
                '1' => $booking->customer->name ?: 'there',
                '2' => $booking->provider?->user?->name ?: 'your Beauty Pro',
                '3' => $booking->date?->format('j F Y') ?: 'Date pending',
                '4' => $this->formattedTime($booking),
                '5' => $booking->service?->name ?: 'Beauty service',
                '6' => $this->dashboardUrl('customer'),
            ],
        );
    }

    private function sendOnce(Booking $booking, string $marker, string $phone, string $type, array $variables): bool
    {
        $sid = $this->templateSid($type);
        if (! $sid || $booking->getAttribute($marker)) {
            return false;
        }

        $claimedAt = now();
        $claimed = Booking::whereKey($booking->id)->whereNull($marker)->update([$marker => $claimedAt]);
        if ($claimed !== 1) {
            return false;
        }

        $sent = $this->twilio->sendTemplate($phone, $sid, $variables);
        if (! $sent) {
            Log::warning('Booking WhatsApp template delivery attempt failed; automatic retries were suppressed to prevent duplicate messages.', [
                'booking_id' => $booking->id,
                'notification_type' => $type,
                'error' => $this->twilio->lastError(),
            ]);

            return false;
        }

        $booking->setAttribute($marker, $claimedAt);

        return true;
    }

    private function formattedTime(Booking $booking): string
    {
        return Carbon::createFromFormat('H:i:s', $this->normalizedTime($booking))->format('g:i A');
    }

    private function normalizedTime(Booking $booking): string
    {
        $time = substr(trim((string) $booking->time), 0, 8);

        return preg_match('/^\d{2}:\d{2}$/', $time) ? $time.':00' : $time;
    }

    private function dashboardUrl(string $role): string
    {
        return rtrim((string) config('app.frontend_url', config('app.url')), '/')."/{$role}/bookings";
    }

    private function sampleVariables(string $type): array
    {
        return match ($type) {
            self::PROVIDER_BOOKING => [
                '1' => 'Ada Beauty Studio', '2' => 'Amara Johnson', '3' => 'Bridal makeup consultation',
                '4' => '10 September 2026', '5' => '10:00 AM', '6' => $this->dashboardUrl('provider'),
            ],
            self::CLIENT_CONFIRMATION => [
                '1' => 'Amara Johnson', '2' => 'Ada Beauty Studio', '3' => 'Bridal makeup consultation',
                '4' => '10 September 2026', '5' => '10:00 AM', '6' => $this->dashboardUrl('customer'),
            ],
            self::CLIENT_REMINDER => [
                '1' => 'Amara Johnson', '2' => 'Ada Beauty Studio', '3' => '10 September 2026',
                '4' => '10:00 AM', '5' => 'Bridal makeup consultation', '6' => $this->dashboardUrl('customer'),
            ],
            default => [],
        };
    }
}
