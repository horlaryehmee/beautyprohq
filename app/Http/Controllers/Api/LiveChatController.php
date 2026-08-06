<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LiveChatConversation;
use App\Models\ProviderProfile;
use App\Notifications\LiveChatProviderMessageNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LiveChatController extends Controller
{
    public function start(Request $request, ProviderProfile $provider): JsonResponse
    {
        abort_unless($provider->is_listed && $provider->user?->is_active && $provider->user->hasPaidPlan(), 404);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'message' => ['required', 'string', 'min:2', 'max:3000'],
        ]);

        $conversation = DB::transaction(function () use ($request, $provider, $validated): LiveChatConversation {
            $conversation = LiveChatConversation::create([
                'provider_id' => $provider->id,
                'customer_id' => $request->user()?->isCustomer() ? $request->user()->id : null,
                'visitor_name' => $validated['name'],
                'visitor_email' => Str::lower($validated['email']),
                'visitor_token' => Str::random(64),
                'status' => 'open',
                'provider_unread_count' => 1,
                'last_message_at' => now(),
            ]);

            $message = $conversation->messages()->create([
                'sender_user_id' => $request->user()?->id,
                'sender_type' => 'visitor',
                'body' => $validated['message'],
            ]);

            $conversation->load(['provider.user', 'messages.sender:id,name']);
            $conversation->provider->user?->notify(new LiveChatProviderMessageNotification($conversation, $message));

            return $conversation;
        });

        return $this->success($this->publicConversationPayload($conversation), 'Your message was sent.', 201);
    }

    public function show(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->authorizeVisitor($request, $conversation);
        $conversation->messages()->where('sender_type', 'provider')->whereNull('read_at')->update(['read_at' => now()]);
        $conversation->forceFill(['visitor_unread_count' => 0])->save();

        return $this->success($this->publicConversationPayload($conversation->fresh(['provider.user', 'messages.sender:id,name'])));
    }

    public function reply(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->authorizeVisitor($request, $conversation);
        $validated = $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:3000'],
        ]);

        $message = DB::transaction(function () use ($request, $conversation, $validated) {
            $message = $conversation->messages()->create([
                'sender_user_id' => $request->user()?->id,
                'sender_type' => 'visitor',
                'body' => $validated['message'],
            ]);
            $conversation->forceFill([
                'status' => 'open',
                'provider_unread_count' => $conversation->provider_unread_count + 1,
                'last_message_at' => now(),
                'closed_at' => null,
            ])->save();
            $conversation->loadMissing(['provider.user']);
            $conversation->provider->user?->notify(new LiveChatProviderMessageNotification($conversation, $message));

            return $message;
        });

        return $this->success($message->load('sender:id,name'), 'Reply sent.', 201);
    }

    private function authorizeVisitor(Request $request, LiveChatConversation $conversation): void
    {
        $token = (string) ($request->input('visitor_token') ?? $request->header('X-Live-Chat-Token'));
        abort_unless(hash_equals($conversation->visitor_token, $token), 403);
    }

    private function publicConversationPayload(LiveChatConversation $conversation): array
    {
        $conversation->loadMissing(['provider.user:id,name', 'messages.sender:id,name']);

        return [
            'id' => $conversation->id,
            'provider_id' => $conversation->provider_id,
            'provider_name' => $conversation->provider?->user?->name,
            'visitor_name' => $conversation->visitor_name,
            'visitor_email' => $conversation->visitor_email,
            'visitor_token' => $conversation->visitor_token,
            'status' => $conversation->status,
            'visitor_unread_count' => $conversation->visitor_unread_count,
            'last_message_at' => $conversation->last_message_at,
            'messages' => $conversation->messages()->oldest()->get(),
        ];
    }
}
