<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\ContentCalendarItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ContentCalendarController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'month' => ['nullable', 'date_format:Y-m'],
            'status' => ['nullable', Rule::in(['idea', 'planned', 'created', 'posted'])],
        ]);

        $provider = $request->user()->providerProfile;
        $query = $provider->hasMany(ContentCalendarItem::class, 'provider_id')->orderBy('scheduled_date');

        if ($validated['month'] ?? null) {
            [$year, $month] = explode('-', $validated['month']);
            $query->whereYear('scheduled_date', $year)->whereMonth('scheduled_date', $month);
        }

        if ($validated['status'] ?? null) {
            $query->where('status', $validated['status']);
        }

        return $this->success($query->get());
    }

    public function store(Request $request): JsonResponse
    {
        $item = $request->user()->providerProfile->hasMany(ContentCalendarItem::class, 'provider_id')->create($this->validated($request));

        return $this->success($item, 'Content calendar item created.', 201);
    }

    public function update(Request $request, ContentCalendarItem $contentCalendarItem): JsonResponse
    {
        $this->own($request, $contentCalendarItem);
        $contentCalendarItem->update($this->validated($request, true));

        return $this->success($contentCalendarItem->fresh(), 'Content calendar item updated.');
    }

    public function destroy(Request $request, ContentCalendarItem $contentCalendarItem): JsonResponse
    {
        $this->own($request, $contentCalendarItem);
        $contentCalendarItem->delete();

        return $this->success(null, 'Content calendar item deleted.');
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'scheduled_date' => [$required, 'date_format:Y-m-d'],
            'title' => [$required, 'string', 'max:160'],
            'channel' => ['nullable', 'string', 'max:80'],
            'content_type' => ['nullable', 'string', 'max:80'],
            'status' => ['sometimes', Rule::in(['idea', 'planned', 'created', 'posted'])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);
    }

    private function own(Request $request, ContentCalendarItem $item): void
    {
        abort_unless($item->provider_id === $request->user()->providerProfile->id, 403);
    }
}
