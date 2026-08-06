<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Event;
use App\Models\EventRegistration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Illuminate\Validation\Rule;

class EventRegistrationController extends Controller
{
    public function events(Request $request): JsonResponse
    {
        $query = Event::query()
            ->withCount([
                'registrations',
                'registrations as registered_count' => fn ($registration) => $registration->where('status', 'registered'),
                'registrations as contacted_count' => fn ($registration) => $registration->where('status', 'contacted'),
                'registrations as attended_count' => fn ($registration) => $registration->where('status', 'attended'),
                'registrations as cancelled_count' => fn ($registration) => $registration->where('status', 'cancelled'),
            ])
            ->orderByRaw('date < ? asc', [now()->startOfDay()])
            ->orderBy('date');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(fn ($inner) => $inner
                ->where('title', 'like', "%{$search}%")
                ->orWhere('location', 'like', "%{$search}%"));
        }

        if ($request->filled('event_id')) {
            $query->where('id', $request->integer('event_id'));
        }

        $events = $query->paginate($request->integer('per_page', 20));

        return $this->success($events->items(), meta: $this->paginationMeta($events));
    }

    public function index(Request $request): JsonResponse
    {
        $query = EventRegistration::query()
            ->with('event:id,title,slug,date,location')
            ->latest();

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $query->where(function ($inner) use ($search): void {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('business_name', 'like', "%{$search}%")
                    ->orWhereHas('event', fn ($event) => $event->where('title', 'like', "%{$search}%"));
            });
        }

        if ($request->filled('status') && $request->query('status') !== 'all') {
            $query->where('status', $request->query('status'));
        }

        if ($request->filled('event_id') && $request->query('event_id') !== 'all') {
            $query->where('event_id', $request->integer('event_id'));
        }

        $registrations = $query->paginate($request->integer('per_page', 20));

        return $this->success($registrations->items(), meta: $this->paginationMeta($registrations));
    }

    public function update(Request $request, EventRegistration $registration): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['registered', 'contacted', 'attended', 'cancelled'])],
        ]);

        $registration->update($data);

        return $this->success($registration->fresh('event:id,title,slug,date,location'), 'Registration updated.');
    }

    public function destroy(EventRegistration $registration): JsonResponse
    {
        $registration->delete();

        return $this->success(null, 'Registration removed.');
    }

    public function export(Event $event): StreamedResponse
    {
        $filename = 'event-registrations-'.$event->id.'-'.now()->format('Y-m-d-His').'.csv';

        return response()->streamDownload(function () use ($event): void {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['Event', 'Event date', 'Location', 'Name', 'Email', 'Phone', 'Business name', 'Professional role', 'Notes', 'Status', 'Registered at']);

            EventRegistration::query()
                ->where('event_id', $event->id)
                ->orderBy('created_at')
                ->chunk(500, function ($registrations) use ($handle, $event): void {
                    foreach ($registrations as $registration) {
                        fputcsv($handle, [
                            $event->title,
                            optional($event->date)->toDateTimeString(),
                            $event->location,
                            $registration->name,
                            $registration->email,
                            $registration->phone,
                            $registration->business_name,
                            $registration->professional_role,
                            $registration->notes,
                            $registration->status,
                            optional($registration->created_at)->toDateTimeString(),
                        ]);
                    }
                });

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv']);
    }
}
