<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return $this->success($request->user()->providerProfile->services()->orderBy('name')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['currency'] ??= $request->user()->providerProfile->default_currency ?? config('currencies.default', 'NGN');
        $service = $request->user()->providerProfile->services()->create($data);

        return $this->success($service, 'Service created.', 201);
    }

    public function update(Request $request, Service $service): JsonResponse
    {
        $this->own($request, $service);
        $service->update($this->validated($request, true));

        return $this->success($service->fresh(), 'Service updated.');
    }

    public function destroy(Request $request, Service $service): JsonResponse
    {
        $this->own($request, $service);
        if ($service->bookings()->exists()) {
            $service->update(['is_active' => false]);
        } else {
            $service->delete();
        }

        return $this->success(null, 'Service removed.');
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $p = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'name' => [$p, 'string', 'max:120'],
            'category' => ['nullable', 'string', 'max:100'],
            'service_type' => ['sometimes', Rule::in(['in_person', 'mobile', 'virtual'])],
            'price' => [$p, 'numeric', 'min:0', 'max:9999999999'],
            'duration_minutes' => [$p, 'integer', 'between:15,720'],
            'description' => ['nullable', 'string', 'max:5000'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if (! $partial) {
            $data['service_type'] ??= 'in_person';
        }

        return $data;
    }

    private function own(Request $request, Service $service): void
    {
        abort_unless($service->provider_id === $request->user()->providerProfile->id, 403);
    }
}
