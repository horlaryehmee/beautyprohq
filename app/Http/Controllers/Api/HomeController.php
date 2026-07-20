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

        return $this->success([
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
    }
}
