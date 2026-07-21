<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunityPost;
use App\Models\Event;
use App\Models\News;
use App\Models\Opportunity;
use App\Models\ProviderProfile;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;

class HomeController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $providerRelations = ['user:id,name', 'services' => fn ($q) => $q->where('is_active', true)->limit(3)];

        $data = Cache::store(app()->runningUnitTests() ? 'array' : 'file')->remember('public.home.payload.v3', now()->addMinute(), function () use ($providerRelations) {
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

            return [
                'pro_of_the_week' => $proOfTheWeek?->toArray(),
                'verified_professionals' => $featuredProviders->where('verified', true)->values()->toArray(),
                'featured_providers' => $featuredProviders->values()->toArray(),
                'news' => News::published()->latest('published_at')->limit(6)->get()->toArray(),
                'events' => Event::published()->where('date', '>=', now()->startOfDay())->orderBy('date')->limit(6)->get()->toArray(),
                'opportunities' => Opportunity::published()->orderByRaw('deadline IS NULL')->orderBy('deadline')->limit(6)->get()->toArray(),
                'community' => CommunityPost::published()->with('provider.user:id,name')->latest('published_at')->limit(6)->get()->toArray(),
                'partner_brands' => [
                    ['name' => 'Zaron Cosmetics'],
                    ['name' => 'House of Tara'],
                    ['name' => 'Nuban Beauty'],
                    ['name' => 'Natural Nigerian'],
                ],
            ];
        });

        return $this->success($data)
            ->header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    }
}
