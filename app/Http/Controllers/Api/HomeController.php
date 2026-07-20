<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunityPost;
use App\Models\Event;
use App\Models\HomepageSetting;
use App\Models\News;
use App\Models\Opportunity;
use App\Models\ProviderProfile;
use Illuminate\Http\JsonResponse;

class HomeController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $providerRelations = ['user:id,name', 'services' => fn ($q) => $q->where('is_active', true)->limit(3)];
        $sortModes = HomepageSetting::query()->pluck('sort_mode', 'section');

        return $this->success([
            'pro_of_the_week' => ProviderProfile::directory()->where('is_pro_of_week', true)->with($providerRelations)->first(),
            'verified_professionals' => ProviderProfile::directory()->where('verified', true)->with($providerRelations)->orderByDesc('rating')->limit(8)->get(),
            'news' => $this->homepageItems(News::published()->where('show_on_homepage', true), $sortModes->get('news', 'custom'), 'published_at')->limit(6)->get(),
            'events' => $this->homepageItems(Event::published()->where('show_on_homepage', true)->where('date', '>=', now()->startOfDay()), $sortModes->get('events', 'custom'), 'date')->limit(6)->get(),
            'opportunities' => $this->homepageItems(Opportunity::published()->where('show_on_homepage', true), $sortModes->get('opportunities', 'custom'), 'deadline')->limit(6)->get(),
            'community' => CommunityPost::published()->with('provider.user:id,name')->latest('published_at')->limit(6)->get(),
            'partner_brands' => [
                ['name' => 'Zaron Cosmetics'],
                ['name' => 'House of Tara'],
                ['name' => 'Nuban Beauty'],
                ['name' => 'Natural Nigerian'],
            ],
        ]);
    }

    private function homepageItems($query, string $sortMode, string $dateColumn)
    {
        return match ($sortMode) {
            'random' => $query->inRandomOrder(),
            'az' => $query->orderBy('title'),
            'za' => $query->orderByDesc('title'),
            'newest' => $query->latest($dateColumn),
            'oldest' => $query->oldest($dateColumn),
            default => $query->orderBy('homepage_order')->orderByDesc($dateColumn),
        };
    }
}
