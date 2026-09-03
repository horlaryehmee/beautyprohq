<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\SupportTicket;
use App\Models\User;
use App\Notifications\PlatformUpdateNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class SupportController extends Controller
{
    private const CATEGORIES = ['general', 'account', 'billing', 'technical', 'verification'];

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['nullable', Rule::in(['open', 'pending_provider', 'resolved', 'closed'])],
        ]);
        $provider = $request->user()->providerProfile;
        $tickets = SupportTicket::query()
            ->where('provider_id', $provider->id)
            ->with(['assignedAdmin:id,name'])
            ->withCount(['messages as provider_unread_count' => fn ($query) => $query->where('sender_role', 'admin')->whereNull('read_at')])
            ->when($validated['status'] ?? null, fn ($query, $status) => $query->where('status', $status))
            ->orderByDesc('last_message_at')
            ->paginate($this->perPage($request, 20, 50));

        return $this->success($tickets->items(), meta: $this->paginationMeta($tickets));
    }

    public function show(Request $request, SupportTicket $ticket): JsonResponse
    {
        $this->authorizeTicket($request, $ticket);
        $ticket->messages()->where('sender_role', 'admin')->whereNull('read_at')->update(['read_at' => now()]);
        $ticket->update(['provider_read_at' => now()]);

        return $this->success($ticket->fresh()->load([
            'assignedAdmin:id,name',
            'messages.sender:id,name,role',
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subject' => ['required', 'string', 'min:4', 'max:180'],
            'category' => ['required', Rule::in(self::CATEGORIES)],
            'message' => ['required', 'string', 'min:10', 'max:6000'],
        ]);
        $user = $request->user();
        $provider = $user->providerProfile;

        $ticket = DB::transaction(function () use ($validated, $provider, $user): SupportTicket {
            $ticket = SupportTicket::create([
                'provider_id' => $provider->id,
                'requester_id' => $user->id,
                'subject' => trim($validated['subject']),
                'category' => $validated['category'],
                'status' => 'open',
                'priority' => $validated['category'] === 'billing' ? 'high' : 'normal',
                'last_message_at' => now(),
                'provider_read_at' => now(),
            ]);
            $ticket->messages()->create([
                'sender_id' => $user->id,
                'sender_role' => 'provider',
                'body' => trim($validated['message']),
                'read_at' => now(),
            ]);

            return $ticket;
        });

        $this->notifyAdmins($ticket, "{$user->name} opened a {$ticket->category} support request.");

        return $this->success($ticket->load(['assignedAdmin:id,name', 'messages.sender:id,name,role']), 'Support request sent. Our team will reply here.', 201);
    }

    public function reply(Request $request, SupportTicket $ticket): JsonResponse
    {
        $this->authorizeTicket($request, $ticket);
        abort_if($ticket->status === 'closed', 422, 'This support request is closed. Open a new request if you still need help.');
        $validated = $request->validate(['message' => ['required', 'string', 'min:1', 'max:6000']]);

        DB::transaction(function () use ($ticket, $request, $validated): void {
            $ticket->messages()->create([
                'sender_id' => $request->user()->id,
                'sender_role' => 'provider',
                'body' => trim($validated['message']),
                'read_at' => now(),
            ]);
            $ticket->update([
                'status' => 'open',
                'resolved_at' => null,
                'last_message_at' => now(),
                'admin_read_at' => null,
            ]);
        });

        $this->notifyAdmins($ticket, "{$request->user()->name} replied to support request #{$ticket->id}.");

        return $this->success($ticket->fresh()->load(['assignedAdmin:id,name', 'messages.sender:id,name,role']), 'Reply sent.');
    }

    private function authorizeTicket(Request $request, SupportTicket $ticket): void
    {
        abort_unless((int) $ticket->provider_id === (int) $request->user()->providerProfile->id, 404);
    }

    private function notifyAdmins(SupportTicket $ticket, string $message): void
    {
        User::query()->where('role', 'admin')->where('is_active', true)->get()->each->notify(new PlatformUpdateNotification(
            'New provider support request',
            $message,
            'Open support inbox',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/support',
            ['support_ticket_id' => $ticket->id, 'provider_id' => $ticket->provider_id],
            mail: false,
        ));
    }
}
