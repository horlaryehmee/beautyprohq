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

        $data = Cache::store(app()->runningUnitTests() ? 'array' : 'file')->remember('public.home.payload.v1', now()->addMinute(), fn () => [
            'pro_of_the_week' => ProviderProfile::directory()->where('is_pro_of_week', true)->with($providerRelations)->first(),
            'verified_professionals' => ProviderProfile::directory()->where('verified', true)->with($providerRelations)->orderByDesc('rating')->limit(8)->get(),
            'news' => News::published()->latest('published_at')->limit(6)->get(),
            'events' => Event::published()->where('date', '>=', now()->startOfDay())->orderBy('date')->limit(6)->get(),
            'opportunities' => Opportunity::published()->orderByRaw('deadline IS NULL')->orderBy('deadline')->limit(6)->get(),
            'community' => CommunityPost::published()->with('provider.user:id,name')->latest('published_at')->limit(6)->get(),
            'partner_brands' => [
                ['name' => 'Zaron Cosmetics'],
                ['name' => 'House of Tara'],
                ['name' => 'Nuban Beauty'],
                ['name' => 'Natural Nigerian'],
            ],
        ]);

        return $this->success($data)
            ->header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
    }
}
