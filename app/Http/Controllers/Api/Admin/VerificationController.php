<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\VerificationRequest;
use App\Notifications\VerificationDecisionNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class VerificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = VerificationRequest::with(['provider.user:id,name,email', 'reviewer:id,name'])
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->latest()->paginate($request->integer('per_page', 20));

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

        $verification->load('provider.user');
        $verification->provider->user->notify(new VerificationDecisionNotification($verification));

        return $this->success($verification, "Verification {$verification->status}.");
    }
}
