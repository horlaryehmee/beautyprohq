<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\LiveChatConversation;
use App\Services\LiveChatService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class LiveChatInboundMailController extends Controller
{
    private const RECIPIENT_PREFIX = 'chat';

    /**
     * Accept a forwarded inbound email reply and post it as a customer message
     * on the matching live chat conversation.
     *
     * Route: POST /api/live-chat/mail/reply
     *
     * Payload format (form-encoded or JSON, matching common mail-forwarding
     * providers e.g. Mailgun / Postmark / a catch-all forwarder):
     *   - recipient / To   : the Reply-To token address "chat-<conversationId>-<signature>@host"
     *   - from / sender    : the customer email (used for context/matching)
     *   - text / body-html / message : the reply body
     *   - token            : (optional) inbound secret if not sent via header
     */
    public function __invoke(Request $request, LiveChatService $liveChat): JsonResponse
    {
        $this->authorizeInbound($request);

        $recipient = (string) ($request->input('recipient') ?? $request->input('To') ?? $request->input('to') ?? '');
        $conversation = $this->resolveConversation($recipient);

        if (! $conversation) {
            return response()->json(['message' => 'No matching live chat conversation for this reply.'], 404);
        }

        $body = $this->messageBody($request);
        if ($body === '') {
            return response()->json(['message' => 'The email reply was empty.'], 422);
        }

        // The reply comes from the customer; empty sender_user_id keeps it a visitor message.
        $message = $liveChat->addVisitorMessage($conversation, $body, null);

        return response()->json([
            'message' => 'Reply added to live chat.',
            'conversation_id' => $conversation->id,
            'message_id' => $message->id,
        ], 201);
    }

    private function authorizeInbound(Request $request): void
    {
        $secret = self::inboundSecret();
        if ($secret === '' || $secret === null) {
            Log::warning('Live chat inbound mail rejected: no secret configured.');
            abort(403, 'Inbound live chat mail is not configured.');
        }

        $signature = (string) ($request->header('X-Live-Chat-Signature') ?? $request->input('token') ?? '');
        abort_unless($signature !== '' && hash_equals($secret, $signature), 403);
    }

    private function resolveConversation(string $recipient): ?LiveChatConversation
    {
        $recipient = trim($recipient);
        if ($recipient === '') {
            return null;
        }

        $local = Str::before($recipient, '@');
        $parts = explode('-', $local);

        // Expected: chat-<conversationId>-<signature>
        if (($parts[0] ?? null) !== self::RECIPIENT_PREFIX || ! isset($parts[1])) {
            return null;
        }

        $conversationId = (int) $parts[1];
        $signature = implode('-', array_slice($parts, 2));

        $conversation = LiveChatConversation::find($conversationId);
        if (! $conversation) {
            return null;
        }

        $expected = $this->signature($conversationId);
        abort_unless($signature !== '' && hash_equals($expected, $signature), 403);

        return $conversation;
    }

    public static function replyToAddress(int $conversationId): string
    {
        $domain = preg_replace('#^https?://#', '', (string) static::replyDomain());
        $domain = rtrim((string) $domain, '/');

        $address = self::RECIPIENT_PREFIX.'-'.$conversationId.'-'.self::signature($conversationId);

        return $address.'@'.$domain;
    }

    private static function signature(int $conversationId): string
    {
        return hash_hmac('sha256', (string) $conversationId, (string) static::inboundSecret());
    }

    private static function inboundSecret(): ?string
    {
        return static::appSetting('live_chat.inbound_secret') ?: config('services.live_chat.inbound_secret');
    }

    private static function replyDomain(): string
    {
        return rtrim((string) (static::appSetting('live_chat.reply_domain') ?: config('app.mail_reply_domain', config('app.url'))), '/');
    }

    private static function appSetting(string $key): ?string
    {
        return \App\Models\AppSetting::getValue($key);
    }

    private function messageBody(Request $request): string
    {
        foreach (['text', 'body', 'message', 'body-plain', 'stripped-text'] as $key) {
            $value = $request->input($key);
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        // Support Postmark/Mailgun html payloads.
        $html = $request->input('html') ?? $request->input('body-html') ?? $request->input('stripped-html');
        if (is_string($html) && trim($html) !== '') {
            return trim(strip_tags($html));
        }

        return '';
    }
}
