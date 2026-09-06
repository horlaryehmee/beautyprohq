<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Support\BookingCalendar;
use Illuminate\Http\Response;

class BookingCalendarController extends Controller
{
    public function __invoke(Booking $booking, BookingCalendar $calendar): Response
    {
        return response($calendar->contents($booking), 200, [
            'Content-Type' => 'text/calendar; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$calendar->filename($booking).'"',
            'Cache-Control' => 'private, no-store, max-age=0',
        ]);
    }
}
