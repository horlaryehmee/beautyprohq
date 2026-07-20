<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\BlockedDate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ScheduleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return $this->success($request->user()->providerProfile->availability()->orderBy('day_of_week')->orderBy('start_time')->get());
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'slots' => ['required', 'array', 'max:40'],
            'slots.*.day_of_week' => ['required', 'integer', 'between:0,6'],
            'slots.*.start_time' => ['required', 'date_format:H:i'],
            'slots.*.end_time' => ['required', 'date_format:H:i', 'after:slots.*.start_time'],
            'slots.*.is_active' => ['sometimes', 'boolean'],
        ]);

        $provider = $request->user()->providerProfile;
        DB::transaction(function () use ($provider, $validated): void {
            $provider->availability()->delete();
            foreach ($validated['slots'] as $slot) {
                $provider->availability()->create($slot);
            }
        });

        return $this->success($provider->availability()->orderBy('day_of_week')->orderBy('start_time')->get(), 'Availability updated.');
    }

    public function blocks(Request $request): JsonResponse
    {
        return $this->success($request->user()->providerProfile->blockedDates()->whereDate('date', '>=', today())->orderBy('date')->get());
    }

    public function storeBlock(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'start_time' => ['nullable', 'required_with:end_time', 'date_format:H:i'],
            'end_time' => ['nullable', 'required_with:start_time', 'date_format:H:i', 'after:start_time'],
            'reason' => ['nullable', 'string', 'max:255'],
        ]);
        $block = $request->user()->providerProfile->blockedDates()->create($validated);

        return $this->success($block, 'Date blocked.', 201);
    }

    public function destroyBlock(Request $request, BlockedDate $blockedDate): JsonResponse
    {
        abort_unless($blockedDate->provider_id === $request->user()->providerProfile->id, 403);
        $blockedDate->delete();

        return $this->success(null, 'Blocked date removed.');
    }
}
