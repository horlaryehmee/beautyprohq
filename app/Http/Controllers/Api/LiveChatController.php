<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CrmCustomer;
use App\Models\LiveChatConversation;
use App\Models\ProviderProfile;
use App\Models\User;
use App\Notifications\LiveChatProviderMessageNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class LiveChatController extends Controller
{
    public function customerIndex(Request $request): JsonResponse
    {
        $conversations = LiveChatConversation::where('customer_id', $request->user()->id)
            ->whereHas('booking', fn ($query) => $query->whereIn('status', ['pending', 'confirmed']))
            ->with(['provider.user:id,name', 'booking.service:id,name', 'messages' => fn ($q) => $q->latest()->limit(1)])
            ->withCount('messages')
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 20));

        return $this->success($conversations->items(), meta: $this->paginationMeta($conversations) + [
            'unread_count' => LiveChatConversation::where('customer_id', $request->user()->id)
                ->whereHas('booking', fn ($query) => $query->whereIn('status', ['pending', 'confirmed']))
                ->sum('visitor_unread_count'),
        ]);
    }

    public function customerShow(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->authorizeCustomerBookingChat($request, $conversation);
        $validated = $request->validate([
            'before_id' => ['nullable', 'integer', 'min:1'],
            'after_id' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $conversation->messages()->where('sender_type', 'provider')->whereNull('read_at')->update(['read_at' => now()]);
        $conversation->forceFill(['visitor_unread_count' => 0])->save();

        return $this->success($this->publicConversationPayload($conversation->fresh(['provider.user', 'booking.service']), $validated));
    }

    public function customerReply(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->authorizeCustomerBookingChat($request, $conversation);
        $validated = $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:3000'],
        ]);

        $message = DB::transaction(function () use ($request, $conversation, $validated) {
            $message = $conversation->messages()->create([
                'sender_user_id' => $request->user()->id,
                'sender_type' => 'visitor',
                'body' => $validated['message'],
            ]);
            $conversation->forceFill([
                'status' => 'open',
                'provider_unread_count' => $conversation->provider_unread_count + 1,
                'last_message_at' => now(),
                'closed_at' => null,
            ])->save();

            return $message;
        });

        $this->notifyProvider($conversation, $message);

        return $this->success($message->load('sender:id,name'), 'Reply sent.', 201);
    }

    public function start(Request $request, ProviderProfile $provider): JsonResponse
    {
        abort_unless($provider->is_listed && $provider->user?->is_active && $provider->user->hasPaidPlan(), 404);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'message' => ['required', 'string', 'min:2', 'max:3000'],
        ]);

        [$conversation, $message] = DB::transaction(function () use ($request, $provider, $validated): array {
            $customer = $this->customerForLiveChat($request, $validated);
            $email = Str::lower($validated['email']);

            $conversation = LiveChatConversation::create([
                'provider_id' => $provider->id,
                'customer_id' => $customer->id,
                'visitor_name' => $validated['name'],
                'visitor_email' => $email,
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

            $this->recordLiveChatCrmActivity($provider, $customer, $validated['message'], 'Live chat started');

            return [$conversation, $message];
        });

        $this->notifyProvider($conversation, $message);

        return $this->success($this->publicConversationPayload($conversation), 'Your message was sent.', 201);
    }

    public function show(Request $request, LiveChatConversation $conversation): JsonResponse
    {
        $this->authorizeVisitor($request, $conversation);
        $validated = $request->validate([
            'before_id' => ['nullable', 'integer', 'min:1'],
            'after_id' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $conversation->messages()->where('sender_type', 'provider')->whereNull('read_at')->update(['read_at' => now()]);
        $conversation->forceFill(['visitor_unread_count' => 0])->save();

        return $this->success($this->publicConversationPayload($conversation->fresh(['provider.user']), $validated));
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

            if ($conversation->customer_id) {
                $this->recordLiveChatCrmActivity(
                    $conversation->provider,
                    $conversation->customer,
                    $validated['message'],
                    'Live chat reply'
                );
            }

            return $message;
        });

        $this->notifyProvider($conversation, $message);

        return $this->success($message->load('sender:id,name'), 'Reply sent.', 201);
    }

    private function authorizeVisitor(Request $request, LiveChatConversation $conversation): void
    {
        if ($request->user()?->isCustomer() && (int) $conversation->customer_id === (int) $request->user()->id) {
            return;
        }

        $token = (string) ($request->input('visitor_token') ?? $request->header('X-Live-Chat-Token'));
        abort_unless(hash_equals($conversation->visitor_token, $token), 403);
    }

    private function authorizeCustomerBookingChat(Request $request, LiveChatConversation $conversation): void
    {
        abort_unless((int) $conversation->customer_id === (int) $request->user()->id, 403);
        abort_unless($conversation->booking_id, 403);
        abort_unless(Booking::whereKey($conversation->booking_id)
            ->where('customer_id', $request->user()->id)
            ->whereIn('status', ['pending', 'confirmed'])
            ->exists(), 403);
    }

    private function notifyProvider(LiveChatConversation $conversation, $message): void
    {
        try {
            $conversation->loadMissing(['provider.user']);
            $conversation->provider->user?->notify(new LiveChatProviderMessageNotification($conversation, $message));
        } catch (Throwable $exception) {
            Log::warning('Live chat provider notification failed.', [
                'conversation_id' => $conversation->id,
                'message_id' => $message->id,
                'provider_id' => $conversation->provider_id,
                'error' => $exception->getMessage(),
            ]);
        }
    }

    private function customerForLiveChat(Request $request, array $validated): User
    {
        if ($request->user()?->isCustomer()) {
            return $request->user();
        }

        $email = Str::lower($validated['email']);
        $customer = User::where('email', $email)->first();

        if ($customer) {
            if (blank($customer->name)) {
                $customer->forceFill(['name' => $validated['name']])->save();
            }

            return $customer;
        }

        return User::create([
            'name' => $validated['name'],
            'email' => $email,
            'password' => Str::random(48),
            'role' => 'customer',
            'is_guest' => true,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
    }

    private function recordLiveChatCrmActivity(ProviderProfile $provider, User $customer, string $message, string $title): void
    {
        $crm = CrmCustomer::firstOrCreate(
            ['provider_id' => $provider->id, 'customer_id' => $customer->id],
            [
                'stage' => 'lead',
                'source' => 'live_chat',
                'priority' => 'normal',
                'support_status' => 'open',
                'tags' => ['live-chat'],
                'last_service_at' => now(),
            ]
        );

        $tags = collect($crm->tags ?? [])->push('live-chat')->unique()->values()->all();
        $updates = [
            'source' => $crm->source ?: 'live_chat',
            'support_status' => 'open',
            'tags' => $tags,
            'last_service_at' => now(),
        ];

        if (blank($crm->notes)) {
            $updates['notes'] = 'Lead came from live chat.';
        }

        $crm->forceFill($updates)->save();

        $crm->activities()->create([
            'type' => 'chat',
            'title' => $title,
            'description' => Str::limit($message, 3000, ''),
            'status' => 'open',
        ]);
    }

    private function publicConversationPayload(LiveChatConversation $conversation, array $options = []): array
    {
        $conversation->loadMissing(['provider.user:id,name', 'booking.service:id,name']);
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
            'provider_name' => $conversation->provider?->user?->name,
            'visitor_name' => $conversation->visitor_name,
            'visitor_email' => $conversation->visitor_email,
            'visitor_token' => $conversation->visitor_token,
            'booking_id' => $conversation->booking_id,
            'service_name' => $conversation->booking?->service?->name,
            'status' => $conversation->status,
            'visitor_unread_count' => $conversation->visitor_unread_count,
            'last_message_at' => $conversation->last_message_at,
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
