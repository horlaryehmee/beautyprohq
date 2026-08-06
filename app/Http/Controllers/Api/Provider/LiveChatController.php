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
        $validated = $request->validate([
            'before_id' => ['nullable', 'integer', 'min:1'],
            'after_id' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $conversation->messages()->where('sender_type', 'visitor')->whereNull('read_at')->update(['read_at' => now()]);
        $conversation->forceFill(['provider_unread_count' => 0])->save();

        return $this->success($this->conversationPayload($conversation->fresh(), $validated));
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

        return $this->success($this->conversationPayload($conversation->fresh()), 'Conversation updated.');
    }

    private function own(Request $request, LiveChatConversation $conversation): void
    {
        abort_unless($conversation->provider_id === $request->user()->providerProfile->id, 403);
    }

    private function conversationPayload(LiveChatConversation $conversation, array $options = []): array
    {
        $perPage = min((int) ($options['per_page'] ?? 50), 100);
        $query = $conversation->messages()->with('sender:id,name');
        $mode = 'latest';

        if (isset($options['after_id'])) {
            $mode = 'after';
            $query->where('id', '>', $options['after_id'])->oldest('id');
        } elseif (isset($options['before_id'])) {
            $mode = 'before';
            $query->where('id', '<', $options['before_id'])->latest('id');
        } else {
            $query->latest('id');
        }

        $items = $query->limit($perPage + 1)->get();
        $hasMore = $items->count() > $perPage;
        $messages = $items->take($perPage);
        if ($mode !== 'after') {
            $messages = $messages->reverse()->values();
        } else {
            $messages = $messages->values();
        }

        return [
            'id' => $conversation->id,
            'provider_id' => $conversation->provider_id,
            'customer_id' => $conversation->customer_id,
            'visitor_name' => $conversation->visitor_name,
            'visitor_email' => $conversation->visitor_email,
            'status' => $conversation->status,
            'provider_unread_count' => $conversation->provider_unread_count,
            'visitor_unread_count' => $conversation->visitor_unread_count,
            'last_message_at' => $conversation->last_message_at,
            'closed_at' => $conversation->closed_at,
            'created_at' => $conversation->created_at,
            'updated_at' => $conversation->updated_at,
            'messages_count' => $conversation->messages()->count(),
            'messages' => $messages,
            'message_page' => [
                'has_older' => $mode === 'latest' || $mode === 'before' ? $hasMore : $conversation->messages()->where('id', '<', $messages->min('id') ?? 0)->exists(),
                'has_newer' => $mode === 'after' ? $hasMore : false,
                'oldest_id' => $messages->min('id'),
                'newest_id' => $messages->max('id'),
            ],
        ];
    }
}
