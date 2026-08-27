<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunityPost;
use App\Models\Event;
use App\Models\News;
use App\Models\Opportunity;
use App\Models\ProviderProfile;
use Illuminate\Http\JsonResponse;

class HomeController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $providerRelations = ['user:id,name', 'services' => fn ($q) => $q->where('is_active', true)->limit(3)];

        $featuredProviders = ProviderProfile::directory()
            ->with($providerRelations)
            ->orderByDesc('verified')
            ->orderByDesc('rating')
            ->limit(8)
            ->get();
        $proOfTheWeek = ProviderProfile::directory()
            ->where('is_pro_of_week', true)
            ->with($providerRelations)
            ->first() ?? $featuredProviders->first();

        $homepageUpdates = collect()
            ->merge(News::published()
                ->where('show_on_homepage', true)
                ->get()
                ->map(fn (News $news): array => [
                    'kind' => 'news',
                    'sort_order' => $news->homepage_sort_order,
                    'sort_date' => $news->published_at?->timestamp ?? 0,
                    'item' => $news->toArray(),
                ]))
            ->merge(Event::published()
                ->where('show_on_homepage', true)
                ->where('date', '>=', now()->startOfDay())
                ->get()
                ->map(fn (Event $event): array => [
                    'kind' => 'event',
                    'sort_order' => $event->homepage_sort_order,
                    'sort_date' => $event->date?->timestamp ?? 0,
                    'item' => $event->toArray(),
                ]))
            ->sortBy([
                fn (array $a, array $b): int => ($a['sort_order'] ?? 999) <=> ($b['sort_order'] ?? 999),
                fn (array $a, array $b): int => $b['sort_date'] <=> $a['sort_date'],
            ])
            ->take(10)
            ->values();

        $data = [
            'pro_of_the_week' => $proOfTheWeek?->toArray(),
            'verified_professionals' => $featuredProviders->where('verified', true)->values()->toArray(),
            'featured_providers' => $featuredProviders->values()->toArray(),
            'news' => $homepageUpdates->where('kind', 'news')->pluck('item')->values()->toArray(),
            'events' => $homepageUpdates->where('kind', 'event')->pluck('item')->values()->toArray(),
            'opportunities' => Opportunity::published()->orderByRaw('deadline IS NULL')->orderBy('deadline')->limit(6)->get()->toArray(),
            'community' => CommunityPost::published()->with('provider.user:id,name')->latest('published_at')->limit(3)->get()->toArray(),
            'partner_brands' => [
                ['name' => 'Zaron Cosmetics'],
                ['name' => 'House of Tara'],
                ['name' => 'Nuban Beauty'],
                ['name' => 'Natural Nigerian'],
            ],
        ];

        return $this->success($data)
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0')
            ->header('X-LiteSpeed-Cache-Control', 'no-cache');
    }
}
