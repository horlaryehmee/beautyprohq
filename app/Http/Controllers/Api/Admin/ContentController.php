<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Support\SafeHtml;
use App\Models\Announcement;
use App\Models\CommunityReport;
use App\Models\CommunityPost;
use App\Models\Event;
use App\Models\News;
use App\Models\Opportunity;
use App\Models\OpportunityEnquiry;
use App\Models\User;
use App\Notifications\AnnouncementNotification;
use App\Services\ContentNewsletterService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ContentController extends Controller
{
    public function news(Request $request): JsonResponse
    {
        return $this->listing(News::query()->latest(), $request, ['title', 'excerpt', 'content']);
    }

    public function showNews(News $news): JsonResponse
    {
        return $this->success($news);
    }

    public function storeNews(Request $request): JsonResponse
    {
        $data = $this->newsData($request);
        $data['author_id'] = $request->user()->id;
        $news = News::create($data);
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($news, 'news', $request->boolean('notify_subscribers'));

        return $this->created($news->fresh(), $this->newsletterMessage('News article created.', $newsletter));
    }

    public function updateNews(Request $request, News $news): JsonResponse
    {
        $news->update($this->newsData($request, $news));
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($news->fresh(), 'news', $request->boolean('notify_subscribers'));

        return $this->updated($news, $this->newsletterMessage('News article updated.', $newsletter));
    }

    public function destroyNews(News $news): JsonResponse
    {
        return $this->removed($news, 'News article removed.');
    }

    public function events(Request $request): JsonResponse
    {
        return $this->listing(Event::query()->orderBy('date'), $request, ['title', 'description', 'location']);
    }

    public function showEvent(Event $event): JsonResponse
    {
        return $this->success($event);
    }

    public function storeEvent(Request $request): JsonResponse
    {
        $data = $this->eventData($request);
        $event = Event::create($data);
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($event, 'event', $request->boolean('notify_subscribers'));

        return $this->created($event->fresh(), $this->newsletterMessage('Event created.', $newsletter));
    }

    public function updateEvent(Request $request, Event $event): JsonResponse
    {
        $event->update($this->eventData($request, $event));
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($event->fresh(), 'event', $request->boolean('notify_subscribers'));

        return $this->updated($event, $this->newsletterMessage('Event updated.', $newsletter));
    }

    public function destroyEvent(Event $event): JsonResponse
    {
        return $this->removed($event, 'Event removed.');
    }

    public function community(Request $request): JsonResponse
    {
        return $this->listing(CommunityPost::with('provider.user:id,name')->latest(), $request, ['title', 'content', 'type', 'topic', 'group_name'], ['type', 'topic', 'group_name']);
    }

    public function showCommunity(CommunityPost $communityPost): JsonResponse
    {
        return $this->success($communityPost->load('provider.user:id,name'));
    }

    public function storeCommunity(Request $request): JsonResponse
    {
        $communityPost = CommunityPost::create($this->communityData($request));
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($communityPost, 'community', $request->boolean('notify_subscribers'));

        return $this->created($communityPost->fresh(), $this->newsletterMessage('Community post created.', $newsletter));
    }

    public function updateCommunity(Request $request, CommunityPost $communityPost): JsonResponse
    {
        $communityPost->update($this->communityData($request, $communityPost));
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($communityPost->fresh(), 'community', $request->boolean('notify_subscribers'));

        return $this->updated($communityPost, $this->newsletterMessage('Community post updated.', $newsletter));
    }

    public function destroyCommunity(CommunityPost $communityPost): JsonResponse
    {
        return $this->removed($communityPost, 'Community post removed.');
    }

    public function communityReports(Request $request): JsonResponse
    {
        $reports = CommunityReport::with(['post:id,title,slug', 'comment:id,body', 'user:id,name,email'])
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->query('status')))
            ->latest()
            ->paginate($this->perPage($request, 20, 100));

        return $this->success($reports->items(), meta: $this->paginationMeta($reports));
    }

    public function updateCommunityReport(Request $request, CommunityReport $report): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(['new', 'reviewing', 'resolved', 'dismissed'])],
            'hide_comment' => ['sometimes', 'boolean'],
        ]);

        $report->update(['status' => $validated['status']]);
        if (($validated['hide_comment'] ?? false) && $report->comment) {
            $report->comment->update(['status' => 'hidden']);
            $post = $report->post;
            $post?->forceFill(['comment_count' => $post->comments()->visible()->count()])->save();
        }

        return $this->updated($report->fresh(['post:id,title,slug', 'comment:id,body', 'user:id,name,email']), 'Community report updated.');
    }

    public function opportunities(Request $request): JsonResponse
    {
        return $this->listing(Opportunity::query()->latest(), $request, ['title', 'description', 'type', 'location'], ['type']);
    }

    public function showOpportunity(Opportunity $opportunity): JsonResponse
    {
        return $this->success($opportunity);
    }

    public function storeOpportunity(Request $request): JsonResponse
    {
        $opportunity = Opportunity::create($this->opportunityData($request));
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($opportunity, 'opportunity', $request->boolean('notify_subscribers'));

        return $this->created($opportunity->fresh(), $this->newsletterMessage('Opportunity created.', $newsletter));
    }

    public function updateOpportunity(Request $request, Opportunity $opportunity): JsonResponse
    {
        $opportunity->update($this->opportunityData($request, true));
        $newsletter = app(ContentNewsletterService::class)->requestOrSend($opportunity->fresh(), 'opportunity', $request->boolean('notify_subscribers'));

        return $this->updated($opportunity, $this->newsletterMessage('Opportunity updated.', $newsletter));
    }

    public function destroyOpportunity(Opportunity $opportunity): JsonResponse
    {
        return $this->removed($opportunity, 'Opportunity removed.');
    }

    public function enquiries(Request $request): JsonResponse
    {
        $items = OpportunityEnquiry::with(['opportunity:id,title,type', 'user:id,name,email'])->when($request->status, fn ($q, $s) => $q->where('status', $s))->latest()->paginate($this->perPage($request, 20, 100));

        return $this->success($items->items(), meta: $this->paginationMeta($items));
    }

    public function updateEnquiry(Request $request, OpportunityEnquiry $enquiry): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['new', 'contacted', 'closed'])]]);
        $enquiry->update($data);

        return $this->updated($enquiry, 'Enquiry updated.');
    }

    public function announcements(Request $request): JsonResponse
    {
        return $this->listing(Announcement::query()->latest(), $request, ['title', 'message'], ['audience']);
    }

    public function storeAnnouncement(Request $request): JsonResponse
    {
        $data = $this->announcementData($request);
        $data['published_at'] ??= now();
        $announcement = Announcement::create($data);
        if ($announcement->published_at && $announcement->published_at->lte(now())) {
            $this->notifyAnnouncementAudience($announcement);
        }

        return $this->created($announcement, 'Announcement sent.');
    }

    public function updateAnnouncement(Request $request, Announcement $announcement): JsonResponse
    {
        $announcement->update($this->announcementData($request, true));

        return $this->updated($announcement, 'Announcement updated.');
    }

    public function destroyAnnouncement(Announcement $announcement): JsonResponse
    {
        return $this->removed($announcement, 'Announcement removed.');
    }

    private function newsData(Request $request, ?News $news = null): array
    {
        $p = $news ? 'sometimes' : 'required';

        $data = $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'slug' => ['nullable', 'string', 'max:200'],
            'excerpt' => ['nullable', 'string', 'max:500'], 'content' => [$p, 'string'], 'image' => ['nullable', 'string', 'max:500'],
            'seo_title' => ['nullable', 'string', 'max:180'], 'seo_description' => ['nullable', 'string', 'max:300'],
            'show_on_homepage' => ['sometimes', 'boolean'], 'homepage_sort_order' => ['nullable', 'integer', 'min:1', 'max:99'],
            'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
        if (array_key_exists('content', $data)) {
            $data['content'] = SafeHtml::clean($data['content']);
        }
        $data = $this->withSlug($data, News::class, $news);

        return $this->autoSeo($data, 'Beauty News', $data['excerpt'] ?? $data['content'] ?? $news?->excerpt ?? $news?->content, $data['title'] ?? $news?->title);
    }

    private function eventData(Request $request, ?Event $event = null): array
    {
        $p = $event ? 'sometimes' : 'required';

        $data = $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'slug' => ['nullable', 'string', 'max:200'],
            'date' => [$p, 'date'], 'location' => [$p, 'string', 'max:255'], 'description' => [$p, 'string', 'max:10000'],
            'image' => ['nullable', 'string', 'max:500'], 'registration_url' => ['nullable', 'url', 'max:500'],
            'seo_title' => ['nullable', 'string', 'max:180'], 'seo_description' => ['nullable', 'string', 'max:300'],
            'show_on_homepage' => ['sometimes', 'boolean'], 'homepage_sort_order' => ['nullable', 'integer', 'min:1', 'max:99'],
            'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
        if (array_key_exists('description', $data)) {
            $data['description'] = SafeHtml::clean($data['description']);
        }
        $data = $this->withSlug($data, Event::class, $event);

        return $this->autoSeo($data, 'Beauty Event', $data['description'] ?? $event?->description, $data['title'] ?? $event?->title);
    }

    private function communityData(Request $request, ?CommunityPost $communityPost = null): array
    {
        $p = $communityPost ? 'sometimes' : 'required';

        $data = $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'slug' => ['nullable', 'string', 'max:200'], 'content' => [$p, 'string'], 'type' => [$p, 'string', 'max:80'],
            'topic' => ['nullable', 'string', 'max:100'], 'group_name' => ['nullable', 'string', 'max:100'],
            'mentions' => ['nullable', 'array'], 'mentions.*' => ['string', 'max:40'],
            'rules' => ['nullable', 'array'], 'rules.*' => ['string', 'max:180'],
            'image' => ['nullable', 'string', 'max:500'], 'provider_id' => ['nullable', 'exists:provider_profiles,id'],
            'seo_title' => ['nullable', 'string', 'max:180'], 'seo_description' => ['nullable', 'string', 'max:300'],
            'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
        $data['topic'] = filled($data['topic'] ?? null) ? trim($data['topic']) : 'General';
        $data['group_name'] = filled($data['group_name'] ?? null) ? trim($data['group_name']) : null;
        $data['mentions'] = collect($data['mentions'] ?? [])->filter()->map(fn ($value) => Str::lower(ltrim(trim($value), '@')))->unique()->values()->all();
        $data['rules'] = collect($data['rules'] ?? [])->filter()->map(fn ($value) => trim($value))->unique()->values()->all();
        if (array_key_exists('content', $data)) {
            $data['content'] = SafeHtml::clean($data['content']);
        }
        $data = $this->withSlug($data, CommunityPost::class, $communityPost, 'community-story');

        return $this->autoSeo($data, 'Beauty Community', $data['content'] ?? $communityPost?->content, $data['title'] ?? $communityPost?->title);
    }

    private function opportunityData(Request $request, bool $partial = false): array
    {
        $p = $partial ? 'sometimes' : 'required';

        $data = $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'type' => [$p, 'string', 'max:100'], 'description' => [$p, 'string', 'max:20000'],
            'contact_info' => ['nullable', 'array'],
            'contact_info.short_description' => ['nullable', 'string', 'max:600'],
            'contact_info.email' => ['nullable', 'email:rfc', 'max:255'],
            'contact_info.url' => ['nullable', 'url:http,https', 'max:500'],
            'location' => ['nullable', 'string', 'max:180'], 'deadline' => ['nullable', 'date'], 'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
        if (array_key_exists('description', $data)) {
            $data['description'] = SafeHtml::clean($data['description']);
        }
        return $data;
    }

    private function announcementData(Request $request, bool $partial = false): array
    {
        $p = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'title' => [$p, 'string', 'max:180'],
            'message' => [$p, 'string', 'max:5000'],
            'audience' => [$p, Rule::in(['all', 'provider', 'customer'])],
            'published_at' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
        ]);
    }

    private function notifyAnnouncementAudience(Announcement $announcement): void
    {
        User::where('is_active', true)
            ->when($announcement->audience !== 'all', fn ($query) => $query->where('role', $announcement->audience))
            ->chunkById(500, fn ($users) => $users->each->notify(new AnnouncementNotification($announcement)));
    }

    private function listing($query, Request $request, array $searchColumns = [], array $filterColumns = []): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        if ($search !== '' && $searchColumns !== []) {
            $query->where(function ($inner) use ($search, $searchColumns): void {
                foreach ($searchColumns as $column) {
                    $inner->orWhere($column, 'like', "%{$search}%");
                }
            });
        }

        if ($request->filled('status')) {
            $status = $request->query('status');
            if ($status === 'published') {
                $query->whereNotNull('published_at')->where('published_at', '<=', now());
            } elseif ($status === 'draft') {
                $query->whereNull('published_at');
            }
        }

        foreach ($filterColumns as $column) {
            if ($request->filled($column) && $request->query($column) !== 'all') {
                $query->where($column, $request->query($column));
            }
        }

        $items = $query->paginate($this->perPage($request, 20, 100));

        return $this->success($items->items(), meta: $this->paginationMeta($items));
    }

    private function created(Model $model, string $message): JsonResponse
    {
        return $this->success($model, $message, 201);
    }

    private function updated(Model $model, string $message): JsonResponse
    {
        return $this->success($model->fresh(), $message);
    }

    private function removed(Model $model, string $message): JsonResponse
    {
        $model->delete();

        return $this->success(null, $message);
    }

    private function newsletterMessage(string $base, array $newsletter): string
    {
        if (! ($newsletter['requested'] ?? false)) {
            return $base;
        }

        if ($newsletter['sent'] ?? false) {
            return $base.' Subscriber email queued for '.$newsletter['count'].' active subscribers.';
        }

        if (($newsletter['count'] ?? 0) > 0) {
            return $base.' Subscriber email was already sent for this item.';
        }

        return $base.' Subscriber email will be sent when this item is published.';
    }

    private function withSlug(array $data, string $model, ?Model $ignore = null, string $fallback = 'post'): array
    {
        if ($ignore && ! array_key_exists('slug', $data) && ! array_key_exists('title', $data)) {
            return $data;
        }

        if (! Schema::hasColumn((new $model)->getTable(), 'slug')) {
            unset($data['slug']);

            return $data;
        }

        $source = $data['slug'] ?? $data['title'] ?? $ignore?->getAttribute('slug') ?? $ignore?->getAttribute('title') ?? $fallback;
        $base = Str::slug($source) ?: $fallback;
        $slug = $base;
        $i = 1;

        while (
            $model::where('slug', $slug)
                ->when($ignore, fn ($query) => $query->whereKeyNot($ignore->getKey()))
                ->exists()
        ) {
            $slug = $base.'-'.$i++;
        }

        $data['slug'] = $slug;

        return $data;
    }

    private function publication(array $data): array
    {
        if (array_key_exists('status', $data)) {
            $data['published_at'] = $data['status'] === 'published' ? ($data['published_at'] ?? now()) : null;
            unset($data['status']);
        }

        return $data;
    }

    private function autoSeo(array $data, string $context, ?string $descriptionSource, ?string $title): array
    {
        if (! array_key_exists('published_at', $data) || blank($data['published_at'] ?? null)) {
            return $data;
        }

        if (filled($title) && blank($data['seo_title'] ?? null)) {
            $data['seo_title'] = Str::limit(trim($title)." | {$context} | BeautyPro HQ", 180, '');
        }

        if (blank($data['seo_description'] ?? null) && filled($descriptionSource)) {
            $description = trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags($descriptionSource), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
            $data['seo_description'] = Str::limit($description, 300, '');
        }

        return $data;
    }
}
