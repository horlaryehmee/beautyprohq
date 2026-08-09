<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunityComment;
use App\Models\CommunityPost;
use App\Models\CommunityReport;
use App\Models\CommunityShare;
use App\Models\ContactEnquiry;
use App\Models\Event;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Opportunity;
use App\Models\User;
use App\Notifications\ContactEnquiryConfirmation;
use App\Notifications\EventRegistrationConfirmation;
use App\Notifications\NewsletterSubscriptionConfirmation;
use App\Notifications\OpportunityEnquiryConfirmation;
use App\Notifications\PlatformUpdateNotification;
use App\Services\MailchimpService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\Notification as NotificationPayload;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PublicContentController extends Controller
{
    public function __construct(private MailchimpService $mailchimp)
    {
    }

    public function news(Request $request): JsonResponse
    {
        $perPage = $request->validate(['per_page' => ['nullable', 'integer', 'between:1,48']])['per_page'] ?? 12;

        return $this->paginated(News::published()->latest('published_at')->paginate($perPage));
    }

    public function showNews(News $news): JsonResponse
    {
        abort_unless($news->published_at?->isPast(), 404);

        return $this->success($news->load('author:id,name'));
    }

    public function events(Request $request): JsonResponse
    {
        $perPage = $request->validate(['per_page' => ['nullable', 'integer', 'between:1,48']])['per_page'] ?? 12;

        return $this->paginated(Event::published()->orderBy('date')->paginate($perPage));
    }

    public function showEvent(Event $event): JsonResponse
    {
        abort_unless($event->published_at?->isPast(), 404);

        return $this->success($event);
    }

    public function registerForEvent(Request $request, Event $event): JsonResponse
    {
        abort_unless($event->published_at?->isPast(), 404);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'business_name' => ['nullable', 'string', 'max:180'],
            'professional_role' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $registration = $event->registrations()->updateOrCreate(
            ['email' => strtolower($validated['email'])],
            $validated + [
                'email' => strtolower($validated['email']),
                'user_id' => $request->user()?->id,
                'status' => 'registered',
            ],
        );

        $this->notifyAdmins(
            'New event registration',
            "{$validated['name']} registered for {$event->title}.",
            '/admin/event-registrations',
            ['event_id' => $event->id, 'event_registration_id' => $registration->id]
        );
        $this->sendPublicConfirmation($registration->email, new EventRegistrationConfirmation($event, $registration));
        $this->mailchimp->syncContact($registration->email, $registration->name, ['Event Attendee', 'Event: '.$event->title]);

        return $this->success($registration, 'Your event registration has been received.', 201);
    }

    public function opportunities(Request $request): JsonResponse
    {
        $perPage = $request->validate(['per_page' => ['nullable', 'integer', 'between:1,48']])['per_page'] ?? 12;

        return $this->paginated(Opportunity::published()->orderByRaw('deadline IS NULL')->orderBy('deadline')->paginate($perPage));
    }

    public function showOpportunity(Opportunity $opportunity): JsonResponse
    {
        abort_unless($opportunity->published_at?->isPast(), 404);

        return $this->success($opportunity);
    }

    public function community(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'type' => ['nullable', 'string', 'max:80'],
            'topic' => ['nullable', 'string', 'max:100'],
            'group' => ['nullable', 'string', 'max:100'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,48'],
        ]);

        $paginator = CommunityPost::published()
            ->with('provider.user:id,name')
            ->when($validated['type'] ?? null, fn ($query, $type) => $query->where('type', $type))
            ->when($validated['topic'] ?? null, fn ($query, $topic) => $query->where('topic', $topic))
            ->when($validated['group'] ?? null, fn ($query, $group) => $query->where('group_name', $group))
            ->latest('published_at')
            ->paginate($validated['per_page'] ?? 12);

        $items = collect($paginator->items())->map(fn (CommunityPost $post) => $this->communityPayload($post, false))->values();

        return $this->success($items, meta: $this->paginationMeta($paginator) + [
            'filters' => [
                'types' => CommunityPost::published()
                    ->select('type')
                    ->distinct()
                    ->orderBy('type')
                    ->pluck('type')
                    ->filter()
                    ->values(),
                'topics' => CommunityPost::published()
                    ->select('topic')
                    ->distinct()
                    ->orderBy('topic')
                    ->pluck('topic')
                    ->filter()
                    ->values(),
                'groups' => CommunityPost::published()
                    ->whereNotNull('group_name')
                    ->select('group_name')
                    ->distinct()
                    ->orderBy('group_name')
                    ->pluck('group_name')
                    ->filter()
                    ->values(),
            ],
        ]);
    }

    public function showCommunity(Request $request, CommunityPost $communityPost): JsonResponse
    {
        abort_unless($communityPost->published_at?->isPast(), 404);

        return $this->success($this->communityPayload($communityPost->load([
            'provider.user:id,name',
            'comments' => fn ($query) => $query->visible()->whereNull('parent_id')->with(['user:id,name,role', 'replies' => fn ($replies) => $replies->visible()->with('user:id,name,role')->oldest()])->oldest(),
        ]), true, $request));
    }

    public function reactToCommunity(Request $request, CommunityPost $communityPost): JsonResponse
    {
        abort_unless($communityPost->published_at?->isPast(), 404);

        $validated = $request->validate([
            'type' => ['required', Rule::in(['like', 'love', 'celebrate', 'helpful'])],
        ]);

        $existing = $communityPost->reactions()->where('user_id', $request->user()->id)->first();
        if ($existing && $existing->type === $validated['type']) {
            $existing->delete();
        } else {
            $communityPost->reactions()->updateOrCreate(
                ['user_id' => $request->user()->id],
                ['type' => $validated['type']]
            );
        }

        $this->refreshCommunityCounters($communityPost);

        return $this->success($this->communityPayload($communityPost->fresh(), false, $request), 'Reaction updated.');
    }

    public function commentOnCommunity(Request $request, CommunityPost $communityPost): JsonResponse
    {
        abort_unless($communityPost->published_at?->isPast(), 404);

        $validated = $request->validate([
            'body' => ['required', 'string', 'min:2', 'max:1500'],
            'parent_id' => ['nullable', 'integer', 'exists:community_comments,id'],
        ]);

        $parentId = $validated['parent_id'] ?? null;
        if ($parentId && ! $communityPost->comments()->whereKey($parentId)->visible()->exists()) {
            abort(422, 'Reply target is not available.');
        }

        $comment = $communityPost->comments()->create([
            'user_id' => $request->user()->id,
            'parent_id' => $parentId,
            'body' => trim(strip_tags($validated['body'])),
            'mentions' => $this->mentionsFrom($validated['body']),
        ]);

        $this->refreshCommunityCounters($communityPost);

        return $this->success($comment->load('user:id,name,role'), 'Comment posted.', 201);
    }

    public function shareCommunity(Request $request, CommunityPost $communityPost): JsonResponse
    {
        abort_unless($communityPost->published_at?->isPast(), 404);

        $validated = $request->validate([
            'channel' => ['nullable', 'string', 'max:40'],
        ]);

        CommunityShare::create([
            'community_post_id' => $communityPost->id,
            'user_id' => $request->user()?->id,
            'channel' => $validated['channel'] ?? 'copy_link',
            'ip_hash' => hash('sha256', $request->ip().'|'.$request->userAgent()),
        ]);

        $this->refreshCommunityCounters($communityPost);

        return $this->success(['share_count' => $communityPost->fresh()->share_count], 'Share recorded.');
    }

    public function reportCommunity(Request $request, CommunityPost $communityPost): JsonResponse
    {
        abort_unless($communityPost->published_at?->isPast(), 404);

        $validated = $request->validate([
            'community_comment_id' => ['nullable', 'integer', 'exists:community_comments,id'],
            'reason' => ['required', Rule::in(['spam', 'harassment', 'unsafe', 'off_topic', 'other'])],
            'details' => ['nullable', 'string', 'max:1000'],
        ]);

        if (($validated['community_comment_id'] ?? null) && ! $communityPost->comments()->whereKey($validated['community_comment_id'])->exists()) {
            abort(422, 'Reported comment is not part of this community post.');
        }

        CommunityReport::create([
            'community_post_id' => $communityPost->id,
            'community_comment_id' => $validated['community_comment_id'] ?? null,
            'user_id' => $request->user()?->id,
            'reason' => $validated['reason'],
            'details' => isset($validated['details']) ? trim(strip_tags($validated['details'])) : null,
        ]);

        $this->refreshCommunityCounters($communityPost);

        return $this->success(null, 'Thanks. The report has been sent to moderation.');
    }

    public function subscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
        ]);
        $subscriber = NewsletterSubscriber::updateOrCreate(
            ['email' => strtolower($validated['email'])],
            ['name' => $validated['name'], 'subscribed_at' => now(), 'unsubscribed_at' => null]
        );
        $this->sendPublicConfirmation($subscriber->email, new NewsletterSubscriptionConfirmation());

        return $this->success($subscriber, 'You are subscribed to BeautyPro HQ updates.', 201);
    }

    public function enquire(Request $request, Opportunity $opportunity): JsonResponse
    {
        abort_unless($opportunity->published_at?->isPast(), 404);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'message' => ['required', 'string', 'max:3000'],
        ]);
        $enquiry = $opportunity->enquiries()->create($validated + ['user_id' => $request->user()?->id]);
        $this->notifyAdmins(
            'New opportunity enquiry',
            "{$validated['name']} applied/enquired about {$opportunity->title}.",
            '/admin/opportunity-enquiries',
            ['opportunity_id' => $opportunity->id, 'enquiry_id' => $enquiry->id]
        );
        $this->sendPublicConfirmation($enquiry->email, new OpportunityEnquiryConfirmation($opportunity, $enquiry));
        $this->mailchimp->syncContact($enquiry->email, $enquiry->name, ['Opportunity Enquiry', 'Opportunity: '.$opportunity->title]);

        return $this->success($enquiry, 'Your enquiry has been sent.', 201);
    }

    public function contact(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:120'],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:30'],
            'instagram' => ['nullable', 'string', 'max:120'],
            'company_name' => ['nullable', 'string', 'max:180'],
            'website' => ['nullable', 'string', 'max:255'],
            'detail_type' => ['nullable', 'string', 'max:180'],
            'message' => ['required', 'string', 'max:3000'],
        ]);

        $enquiry = ContactEnquiry::create($validated + ['user_id' => $request->user()?->id]);
        $this->notifyAdmins(
            'New contact enquiry',
            "{$validated['name']} sent a {$validated['reason']} enquiry.",
            '/admin/activity?type=messages',
            ['contact_enquiry_id' => $enquiry->id]
        );
        $this->sendPublicConfirmation($enquiry->email, new ContactEnquiryConfirmation($enquiry));
        $this->mailchimp->syncContact($enquiry->email, $enquiry->name, ['Contact Enquiry', 'Contact Reason: '.$enquiry->reason]);

        return $this->success($enquiry, 'Your message has been sent to BeautyPro HQ.', 201);
    }

    private function paginated($paginator): JsonResponse
    {
        return $this->success($paginator->items(), meta: $this->paginationMeta($paginator))
            ->header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');
    }

    private function notifyAdmins(string $title, string $message, string $path, array $data = []): void
    {
        $url = rtrim(config('app.frontend_url', config('app.url')), '/').$path;
        User::where('role', 'admin')->where('is_active', true)->get()
            ->each->notify(new PlatformUpdateNotification($title, $message, 'Review in admin', $url, $data));
    }

    private function sendPublicConfirmation(string $email, NotificationPayload $notification): void
    {
        try {
            Notification::route('mail', $email)->notify($notification);
        } catch (\Throwable $exception) {
            Log::warning('Public confirmation email failed.', [
                'email_hash' => hash('sha256', strtolower($email)),
                'notification' => $notification::class,
                'exception' => $exception::class,
            ]);
        }
    }

    private function communityPayload(CommunityPost $post, bool $detail = false, ?Request $request = null): array
    {
        $payload = $post->toArray();
        $payload['reaction_summary'] = $post->reactions()
            ->selectRaw('type, count(*) as total')
            ->groupBy('type')
            ->pluck('total', 'type');
        $payload['viewer_reaction'] = $request?->user()
            ? $post->reactions()->where('user_id', $request->user()->id)->value('type')
            : null;
        $payload['rules'] = $post->rules ?: $this->defaultCommunityRules();

        if ($detail) {
            $payload['comments'] = $post->comments->map(fn (CommunityComment $comment) => $this->commentPayload($comment))->values();
        }

        return $payload;
    }

    private function commentPayload(CommunityComment $comment): array
    {
        $payload = $comment->toArray();
        $payload['replies'] = $comment->replies->map(fn (CommunityComment $reply) => $this->commentPayload($reply))->values();

        return $payload;
    }

    private function mentionsFrom(string $value): array
    {
        preg_match_all('/@([a-zA-Z0-9_.-]{2,40})/', $value, $matches);

        return collect($matches[1] ?? [])->map(fn ($item) => Str::lower($item))->unique()->values()->all();
    }

    private function defaultCommunityRules(): array
    {
        return [
            'Be respectful and constructive.',
            'Keep posts relevant to beauty, business, careers, events, and client experience.',
            'Do not share private client information or spam promotions.',
        ];
    }

    private function refreshCommunityCounters(CommunityPost $post): void
    {
        $post->forceFill([
            'reaction_count' => $post->reactions()->count(),
            'comment_count' => $post->comments()->visible()->count(),
            'share_count' => $post->shares()->count(),
            'report_count' => $post->reports()->count(),
        ])->save();
    }
}
