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
use Illuminate\Support\Facades\Schema;

class HomeController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $providerRelations = ['user:id,name', 'services' => fn ($q) => $q->where('is_active', true)->limit(3)];
        $sortModes = Schema::hasTable('homepage_settings') ? HomepageSetting::query()->pluck('sort_mode', 'section') : collect();
        $hasCurationColumns = Schema::hasColumn('news', 'show_on_homepage')
            && Schema::hasColumn('events', 'show_on_homepage')
            && Schema::hasColumn('opportunities', 'show_on_homepage');

        return $this->success([
            'pro_of_the_week' => ProviderProfile::directory()->where('is_pro_of_week', true)->with($providerRelations)->first(),
            'verified_professionals' => ProviderProfile::directory()->where('verified', true)->with($providerRelations)->orderByDesc('rating')->limit(8)->get(),
            'news' => $this->homepageItems($this->curated(News::published(), $hasCurationColumns), $sortModes->get('news', 'custom'), 'published_at', $hasCurationColumns)->limit(6)->get(),
            'events' => $this->homepageItems($this->curated(Event::published(), $hasCurationColumns)->where('date', '>=', now()->startOfDay()), $sortModes->get('events', 'custom'), 'date', $hasCurationColumns)->limit(6)->get(),
            'opportunities' => $this->homepageItems($this->curated(Opportunity::published(), $hasCurationColumns), $sortModes->get('opportunities', 'custom'), 'deadline', $hasCurationColumns)->limit(6)->get(),
            'community' => CommunityPost::published()->with('provider.user:id,name')->latest('published_at')->limit(6)->get(),
            'partner_brands' => [
                ['name' => 'Zaron Cosmetics'],
                ['name' => 'House of Tara'],
                ['name' => 'Nuban Beauty'],
                ['name' => 'Natural Nigerian'],
            ],
        ]);
    }

    private function curated($query, bool $hasCurationColumns)
    {
        return $hasCurationColumns ? $query->where('show_on_homepage', true) : $query;
    }

    private function homepageItems($query, string $sortMode, string $dateColumn, bool $hasCurationColumns)
    {
        return match ($sortMode) {
            'random' => $query->inRandomOrder(),
            'az' => $query->orderBy('title'),
            'za' => $query->orderByDesc('title'),
            'newest' => $query->latest($dateColumn),
            'oldest' => $query->oldest($dateColumn),
            default => $hasCurationColumns ? $query->orderBy('homepage_order')->orderByDesc($dateColumn) : $query->orderByDesc($dateColumn),
        };
    }
}
