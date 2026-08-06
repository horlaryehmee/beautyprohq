<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\LiveChatConversation;
use App\Notifications\LiveChatCustomerReplyNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;

class LiveChatController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['open', 'waiting', 'closed'])],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'between:1,50'],
        ]);

        $conversations = LiveChatConversation::where('provider_id', $provider->id)
            ->with(['messages' => fn ($q) => $q->latest()->limit(1)])
            ->withCount('messages')
            ->when($validated['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($validated['search'] ?? null, function ($q, string $search): void {
                $q->where(function ($query) use ($search): void {
                    $query->where('visitor_name', 'like', "%{$search}%")
                        ->orWhere('visitor_email', 'like', "%{$search}%")
                        ->orWhereHas('messages', fn ($messages) => $messages->where('body', 'like', "%{$search}%"));
                });
            })
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->paginate($validated['per_page'] ?? 20);

        return $this->success($conversations->items(), meta: $this->paginationMeta($conversations) + [
            'unread_count' => LiveChatConversation::where('provider_id', $provider->id)->sum('provider_unread_count'),
        ]);
    }

    public function show(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->own($request, $conversation);
        $conversation->messages()->where('sender_type', 'visitor')->whereNull('read_at')->update(['read_at' => now()]);
        $conversation->forceFill(['provider_unread_count' => 0])->save();

        return $this->success($conversation->fresh(['messages.sender:id,name']));
    }

    public function reply(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->own($request, $conversation);
        abort_if($conversation->status === 'closed', 422, 'Reopen this conversation before replying.');

        $validated = $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:3000'],
        ]);

        $message = DB::transaction(function () use ($request, $conversation, $validated) {
            $message = $conversation->messages()->create([
                'sender_user_id' => $request->user()->id,
                'sender_type' => 'provider',
                'body' => $validated['message'],
            ]);
            $conversation->forceFill([
                'status' => 'waiting',
                'visitor_unread_count' => $conversation->visitor_unread_count + 1,
                'last_message_at' => now(),
            ])->save();
            $conversation->loadMissing(['provider.user']);
            Notification::route('mail', $conversation->visitor_email)
                ->notify(new LiveChatCustomerReplyNotification($conversation, $message));

            return $message;
        });

        return $this->success($message->load('sender:id,name'), 'Reply sent.', 201);
    }

    public function update(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->own($request, $conversation);
        $validated = $request->validate([
            'status' => ['required', Rule::in(['open', 'waiting', 'closed'])],
        ]);

        $conversation->update([
            'status' => $validated['status'],
            'closed_at' => $validated['status'] === 'closed' ? now() : null,
        ]);

        return $this->success($conversation->fresh(['messages.sender:id,name']), 'Conversation updated.');
    }

    private function own(Request $request, LiveChatConversation $conversation): void
    {
        abort_unless($conversation->provider_id === $request->user()->providerProfile->id, 403);
    }
}
