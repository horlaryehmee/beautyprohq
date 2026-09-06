<?php

namespace App\Support;

use App\Models\Booking;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\URL;

class BookingCalendar
{
    public function links(Booking $booking): array
    {
        $event = $this->event($booking);

        return [
            'google' => 'https://calendar.google.com/calendar/render?'.http_build_query([
                'action' => 'TEMPLATE',
                'text' => $event['summary'],
                'dates' => $event['start']->utc()->format('Ymd\THis\Z').'/'.$event['end']->utc()->format('Ymd\THis\Z'),
                'details' => $event['description'],
                'location' => $event['location'],
            ], '', '&', PHP_QUERY_RFC3986),
            'download' => URL::signedRoute('bookings.calendar', ['booking' => $booking->getKey()]),
        ];
    }

    public function filename(Booking $booking): string
    {
        return 'beautypro-booking-'.$booking->getKey().'.ics';
    }

    public function contents(Booking $booking): string
    {
        $event = $this->event($booking);
        $cancelled = in_array($booking->status, ['cancelled', 'rejected'], true);
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//BeautyPro HQ//Booking Calendar//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:booking-'.$booking->getKey().'@beautyprohq.com',
            'DTSTAMP:'.now('UTC')->format('Ymd\THis\Z'),
            'DTSTART:'.$event['start']->utc()->format('Ymd\THis\Z'),
            'DTEND:'.$event['end']->utc()->format('Ymd\THis\Z'),
            'SUMMARY:'.$this->escape($event['summary']),
            'DESCRIPTION:'.$this->escape($event['description']),
            'LOCATION:'.$this->escape($event['location']),
            'STATUS:'.($cancelled ? 'CANCELLED' : 'CONFIRMED'),
            'END:VEVENT',
            'END:VCALENDAR',
        ];

        return implode("\r\n", $lines)."\r\n";
    }

    private function event(Booking $booking): array
    {
        $booking->loadMissing(['provider.user', 'customer', 'service']);
        $timezone = $booking->provider?->timezone ?: config('app.timezone', 'Africa/Lagos');
        $date = $booking->date->format('Y-m-d');
        $start = CarbonImmutable::createFromFormat(
            'Y-m-d H:i:s',
            $date.' '.$this->clock($booking->time),
            $timezone
        );
        $end = filled($booking->end_time)
            ? CarbonImmutable::createFromFormat('Y-m-d H:i:s', $date.' '.$this->clock($booking->end_time), $timezone)
            : $start->addMinutes(max(1, (int) ($booking->service?->duration_minutes ?: 60)));

        if ($end->lessThanOrEqualTo($start)) {
            $end = $end->addDay();
        }

        $providerName = $booking->provider?->user?->name ?: 'Beauty professional';
        $serviceName = $booking->service?->name ?: 'Beauty appointment';
        $location = trim((string) ($booking->provider?->location ?? ''));

        return [
            'summary' => $serviceName.' with '.$providerName,
            'description' => implode("\n", [
                'BeautyPro HQ booking #'.$booking->getKey(),
                'Status: '.ucfirst((string) $booking->status),
                'Service: '.$serviceName,
                'Provider: '.$providerName,
                'Customer: '.($booking->customer?->name ?: 'Customer'),
            ]),
            'location' => $location,
            'start' => $start,
            'end' => $end,
        ];
    }

    private function escape(string $value): string
    {
        return str_replace(
            ['\\', "\r\n", "\n", "\r", ';', ','],
            ['\\\\', '\\n', '\\n', '\\n', '\\;', '\\,'],
            $value
        );
    }

    private function clock(mixed $value): string
    {
        $clock = substr((string) $value, 0, 8);

        return substr_count($clock, ':') === 1 ? $clock.':00' : $clock;
    }
}
