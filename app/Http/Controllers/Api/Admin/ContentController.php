<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\CommunityPost;
use App\Models\Event;
use App\Models\News;
use App\Models\Opportunity;
use App\Models\OpportunityEnquiry;
use App\Models\User;
use App\Notifications\AnnouncementNotification;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ContentController extends Controller
{
    public function uploadMedia(Request $request): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp,gif', 'max:5120'],
        ]);

        $path = $data['image']->store('content', 'public');

        return $this->success([
            'path' => $path,
            'url' => Storage::url($path),
        ], 'Image uploaded.', 201);
    }

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
        $data['slug'] = $data['slug'] ?? $this->slug(News::class, $data['title']);
        $data['author_id'] = $request->user()->id;

        return $this->created(News::create($data), 'News article created.');
    }

    public function updateNews(Request $request, News $news): JsonResponse
    {
        $news->update($this->newsData($request, $news));

        return $this->updated($news, 'News article updated.');
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
        $data['slug'] = $data['slug'] ?? $this->slug(Event::class, $data['title']);

        return $this->created(Event::create($data), 'Event created.');
    }

    public function updateEvent(Request $request, Event $event): JsonResponse
    {
        $event->update($this->eventData($request, $event));

        return $this->updated($event, 'Event updated.');
    }

    public function destroyEvent(Event $event): JsonResponse
    {
        return $this->removed($event, 'Event removed.');
    }

    public function community(Request $request): JsonResponse
    {
        return $this->listing(CommunityPost::with('provider.user:id,name')->latest(), $request, ['title', 'content', 'type'], ['type']);
    }

    public function showCommunity(CommunityPost $communityPost): JsonResponse
    {
        return $this->success($communityPost->load('provider.user:id,name'));
    }

    public function storeCommunity(Request $request): JsonResponse
    {
        return $this->created(CommunityPost::create($this->communityData($request)), 'Community post created.');
    }

    public function updateCommunity(Request $request, CommunityPost $communityPost): JsonResponse
    {
        $communityPost->update($this->communityData($request, true));

        return $this->updated($communityPost, 'Community post updated.');
    }

    public function destroyCommunity(CommunityPost $communityPost): JsonResponse
    {
        return $this->removed($communityPost, 'Community post removed.');
    }

    public function opportunities(Request $request): JsonResponse
    {
        return $this->listing(Opportunity::query()->latest(), $request, ['title', 'description', 'type', 'location'], ['type']);
    }

    public function storeOpportunity(Request $request): JsonResponse
    {
        return $this->created(Opportunity::create($this->opportunityData($request)), 'Opportunity created.');
    }

    public function updateOpportunity(Request $request, Opportunity $opportunity): JsonResponse
    {
        $opportunity->update($this->opportunityData($request, true));

        return $this->updated($opportunity, 'Opportunity updated.');
    }

    public function destroyOpportunity(Opportunity $opportunity): JsonResponse
    {
        return $this->removed($opportunity, 'Opportunity removed.');
    }

    public function enquiries(Request $request): JsonResponse
    {
        $items = OpportunityEnquiry::with(['opportunity:id,title,type', 'user:id,name,email'])->when($request->status, fn ($q, $s) => $q->where('status', $s))->latest()->paginate($request->integer('per_page', 20));

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

        return $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'slug' => ['sometimes', 'string', 'max:200', Rule::unique('news', 'slug')->ignore($news)],
            'excerpt' => ['nullable', 'string', 'max:500'], 'content' => [$p, 'string'], 'image' => ['nullable', 'string', 'max:500'],
            'seo_title' => ['nullable', 'string', 'max:180'], 'seo_description' => ['nullable', 'string', 'max:300'],
            'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
    }

    private function eventData(Request $request, ?Event $event = null): array
    {
        $p = $event ? 'sometimes' : 'required';

        return $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'slug' => ['sometimes', 'string', 'max:200', Rule::unique('events', 'slug')->ignore($event)],
            'date' => [$p, 'date'], 'location' => [$p, 'string', 'max:255'], 'description' => [$p, 'string', 'max:10000'],
            'image' => ['nullable', 'string', 'max:500'], 'registration_url' => ['nullable', 'url', 'max:500'],
            'seo_title' => ['nullable', 'string', 'max:180'], 'seo_description' => ['nullable', 'string', 'max:300'],
            'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
    }

    private function communityData(Request $request, bool $partial = false): array
    {
        $p = $partial ? 'sometimes' : 'required';

        return $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'content' => [$p, 'string'], 'type' => [$p, 'string', 'max:80'],
            'image' => ['nullable', 'string', 'max:500'], 'provider_id' => ['nullable', 'exists:provider_profiles,id'],
            'seo_title' => ['nullable', 'string', 'max:180'], 'seo_description' => ['nullable', 'string', 'max:300'],
            'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
    }

    private function opportunityData(Request $request, bool $partial = false): array
    {
        $p = $partial ? 'sometimes' : 'required';

        return $this->publication($request->validate([
            'title' => [$p, 'string', 'max:180'], 'type' => [$p, 'string', 'max:100'], 'description' => [$p, 'string', 'max:10000'],
            'contact_info' => ['nullable', 'array'], 'location' => ['nullable', 'string', 'max:180'], 'deadline' => ['nullable', 'date'], 'published_at' => ['nullable', 'date'], 'status' => ['sometimes', Rule::in(['draft', 'published'])],
        ]));
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

        $items = $query->paginate($request->integer('per_page', 20));

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

    private function slug(string $model, string $title): string
    {
        $base = Str::slug($title) ?: 'post';
        $slug = $base;
        $i = 1;
        while ($model::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$i++;
        }

        return $slug;
    }

    private function publication(array $data): array
    {
        if (array_key_exists('status', $data)) {
            $data['published_at'] = $data['status'] === 'published' ? ($data['published_at'] ?? now()) : null;
            unset($data['status']);
        }

        return $data;
    }
}
