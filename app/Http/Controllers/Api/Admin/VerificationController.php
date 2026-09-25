<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\UploadedMedia;
use App\Models\VerificationRequest;
use App\Notifications\VerificationDecisionNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class VerificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = VerificationRequest::with([
            'provider.user:id,name,email',
            'provider.portfolioItems' => fn ($query) => $query->orderBy('sort_order'),
            'reviewer:id,name',
        ])
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->latest()->paginate($this->perPage($request, 20, 100));

        $items->setCollection($items->getCollection()->map(fn (VerificationRequest $verification): array => $this->verificationPayload($verification)));

        return $this->success($items->items(), meta: $this->paginationMeta($items));
    }

    public function update(Request $request, VerificationRequest $verification): JsonResponse
    {
        abort_unless($verification->status === 'pending', 422, 'This request has already been reviewed.');
        $validated = $request->validate(['status' => ['required', Rule::in(['approved', 'rejected'])], 'admin_notes' => ['nullable', 'string', 'max:3000']]);

        DB::transaction(function () use ($verification, $validated, $request): void {
            $verification->update($validated + ['reviewed_by' => $request->user()->id, 'reviewed_at' => now()]);
            $verification->provider()->update(['verified' => $validated['status'] === 'approved']);
        });

        // Clear homepage cache so badges update immediately
        Cache::forget('public.home.payload.v6');
        Cache::forget('public.home.payload.v5');

        // Notify provider safely
        $verification->load('provider.user');
        if ($verification->provider?->user) {
            $verification->provider->user->notify(new VerificationDecisionNotification($verification));
        }

        return $this->success($verification, "Verification {$verification->status}.");
    }

    private function verificationPayload(VerificationRequest $verification): array
    {
        return [
            ...$verification->toArray(),
            'certification_media' => $this->mediaPayloads($verification->certification_files ?? []),
            'license_media' => $this->mediaPayloads($verification->license_files ?? []),
        ];
    }

    private function mediaPayloads(array $references): array
    {
        $ids = collect($references)
            ->filter(fn (mixed $reference): bool => is_string($reference) && preg_match('/^media:\d+$/', $reference) === 1)
            ->map(fn (string $reference): int => (int) str($reference)->after('media:')->value())
            ->filter()
            ->values();

        $media = UploadedMedia::whereIn('id', $ids)->get()->keyBy('id');

        return collect($references)->map(function (mixed $reference) use ($media): array {
            $path = trim((string) $reference);
            $record = preg_match('/^media:(\d+)$/', $path, $match)
                ? $media->get((int) $match[1])
                : null;

            if ($record instanceof UploadedMedia) {
                return [
                    'id' => $record->id,
                    'name' => $record->original_name ?: $record->filename,
                    'filename' => $record->filename,
                    'path' => $record->disk === 'verification' ? 'media:'.$record->id : $record->path,
                    'url' => $record->url,
                    'mime_type' => $record->mime_type,
                    'type' => $record->type,
                    'size' => $record->size,
                    'collection' => $record->collection,
                    'created_at' => $record->created_at,
                ];
            }

            return [
                'path' => $path,
                'url' => $path,
                'name' => basename($path) ?: 'Uploaded file',
                'mime_type' => null,
                'type' => null,
                'size' => null,
                'collection' => null,
                'created_at' => null,
            ];
        })->values()->all();
    }
}
