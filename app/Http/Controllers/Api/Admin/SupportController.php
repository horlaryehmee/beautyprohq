<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Notifications\PlatformUpdateNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SupportController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['open', 'pending_provider', 'resolved', 'closed'])],
            'search' => ['nullable', 'string', 'max:120'],
        ]);
        $tickets = SupportTicket::query()
            ->with(['provider.user:id,name,email', 'assignedAdmin:id,name'])
            ->withCount(['messages as admin_unread_count' => fn ($query) => $query->where('sender_role', 'provider')->whereNull('read_at')])
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->when($validated['search'] ?? null, function ($query, $search): void {
                $query->where(function ($query) use ($search): void {
                    $query->where('subject', 'like', "%{$search}%")
                        ->orWhereHas('provider.user', fn ($users) => $users->where('name', 'like', "%{$search}%")->orWhere('email', 'like', "%{$search}%"));
                });
            })
            ->orderByRaw("case when status = 'open' then 0 when status = 'pending_provider' then 1 when status = 'resolved' then 2 else 3 end")
            ->orderByDesc('last_message_at')
            ->paginate($this->perPage($request, 25, 100));

        return $this->success($tickets->items(), meta: $this->paginationMeta($tickets));
    }

    public function show(SupportTicket $ticket): JsonResponse
    {
        $ticket->messages()->where('sender_role', 'provider')->whereNull('read_at')->update(['read_at' => now()]);
        $ticket->update(['admin_read_at' => now()]);

        return $this->success($ticket->fresh()->load([
            'provider.user:id,name,email,phone',
            'assignedAdmin:id,name',
            'messages.sender:id,name,role',
        ]));
    }

    public function reply(Request $request, SupportTicket $ticket): JsonResponse
    {
        abort_if($ticket->status === 'closed', 422, 'Reopen this request before sending a reply.');
        $validated = $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:6000'],
            'status' => ['nullable', Rule::in(['pending_provider', 'resolved'])],
        ]);

        DB::transaction(function () use ($ticket, $request, $validated): void {
            $ticket->messages()->create([
                'sender_id' => $request->user()->id,
                'sender_role' => 'admin',
                'body' => trim($validated['message']),
            ]);
            $status = $validated['status'] ?? 'pending_provider';
            $ticket->update([
                'assigned_admin_id' => $ticket->assigned_admin_id ?: $request->user()->id,
                'status' => $status,
                'resolved_at' => $status === 'resolved' ? now() : null,
                'closed_at' => null,
                'last_message_at' => now(),
                'provider_read_at' => null,
            ]);
        });

        $ticket->requester?->notify(new PlatformUpdateNotification(
            'Support replied to your request',
            "Our team replied to: {$ticket->subject}",
            'Open support',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/settings?tab=support',
            ['support_ticket_id' => $ticket->id],
            mail: false,
        ));

        return $this->success($ticket->fresh()->load(['provider.user:id,name,email', 'assignedAdmin:id,name', 'messages.sender:id,name,role']), 'Support reply sent.');
    }

    public function update(Request $request, SupportTicket $ticket): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['open', 'pending_provider', 'resolved', 'closed'])],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high'])],
        ]);
        $updates = $validated;
        if (($validated['status'] ?? null) === 'resolved') {
            $updates['resolved_at'] = now();
            $updates['closed_at'] = null;
        }
        if (($validated['status'] ?? null) === 'closed') $updates['closed_at'] = now();
        if (in_array($validated['status'] ?? null, ['open', 'pending_provider'], true)) {
            $updates['closed_at'] = null;
            $updates['resolved_at'] = null;
        }
        $ticket->update($updates);

        return $this->success($ticket->fresh()->load(['provider.user:id,name,email', 'assignedAdmin:id,name']), 'Support request updated.');
    }
}
