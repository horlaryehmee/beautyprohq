<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\EventRegistration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EventRegistrationController extends Controller
{
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
}
