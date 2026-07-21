<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunityPost;
use App\Models\ContactEnquiry;
use App\Models\Event;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Opportunity;
use App\Models\User;
use App\Notifications\PlatformUpdateNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PublicContentController extends Controller
{
    public function news(Request $request): JsonResponse
    {
        return $this->paginated(News::published()->latest('published_at')->paginate($request->integer('per_page', 12)));
    }

    public function showNews(News $news): JsonResponse
    {
        abort_unless($news->published_at?->isPast(), 404);

        return $this->success($news->load('author:id,name'));
    }

    public function events(Request $request): JsonResponse
    {
        return $this->paginated(Event::published()->orderBy('date')->paginate($request->integer('per_page', 12)));
    }

    public function showEvent(Event $event): JsonResponse
    {
        abort_unless($event->published_at?->isPast(), 404);

        return $this->success($event);
    }

    public function opportunities(Request $request): JsonResponse
    {
        return $this->paginated(Opportunity::published()->orderByRaw('deadline IS NULL')->orderBy('deadline')->paginate($request->integer('per_page', 12)));
    }

    public function showOpportunity(Opportunity $opportunity): JsonResponse
    {
        abort_unless($opportunity->published_at?->isPast(), 404);

        return $this->success($opportunity);
    }

    public function community(Request $request): JsonResponse
    {
        return $this->paginated(CommunityPost::published()->with('provider.user:id,name')->latest('published_at')->paginate($request->integer('per_page', 12)));
    }

    public function showCommunity(CommunityPost $communityPost): JsonResponse
    {
        abort_unless($communityPost->published_at?->isPast(), 404);

        return $this->success($communityPost->load('provider.user:id,name'));
    }

    public function subscribe(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email', 'max:255']]);
        $subscriber = NewsletterSubscriber::updateOrCreate(['email' => strtolower($validated['email'])], ['subscribed_at' => now(), 'unsubscribed_at' => null]);

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

        return $this->success($enquiry, 'Your message has been sent to BeautyPro HQ.', 201);
    }

    private function paginated($paginator): JsonResponse
    {
        return $this->success($paginator->items(), meta: $this->paginationMeta($paginator));
    }

    private function notifyAdmins(string $title, string $message, string $path, array $data = []): void
    {
        $url = rtrim(config('app.frontend_url', config('app.url')), '/').$path;
        User::where('role', 'admin')->where('is_active', true)->get()
            ->each->notify(new PlatformUpdateNotification($title, $message, 'Review in admin', $url, $data));
    }
}
