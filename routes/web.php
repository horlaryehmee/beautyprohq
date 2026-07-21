<?php

use App\Models\ProviderProfile;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

Route::get('/', function () {
    $photos = collect(Cache::store(app()->runningUnitTests() ? 'array' : 'file')->remember('homepage.hero.photos.v1', now()->addMinutes(5), fn () => (
        ProviderProfile::directory()
            ->where('verified', true)
            ->orderByDesc('rating')
            ->orderBy('id')
            ->limit(8)
            ->pluck('profile_photo')
            ->filter()
            ->values()
            ->all()
    )));
    $photo = $photos->first();
    $heroPreload = null;

    if ($photo) {
        if (str_starts_with($photo, 'https://images.unsplash.com/')) {
            $parts = parse_url($photo);
            parse_str($parts['query'] ?? '', $query);
            $base = ($parts['scheme'] ?? 'https').'://'.$parts['host'].($parts['path'] ?? '');
            $build = static function (int $width) use ($base, $query): string {
                return $base.'?'.http_build_query([...$query, 'auto' => 'format', 'fit' => 'crop', 'w' => $width, 'q' => 70]);
            };
            $heroPreload = [
                'original' => $photo,
                'initialImages' => $photos->all(),
                'src' => $build(560),
                'srcset' => collect([280, 400, 560])->map(fn (int $width) => $build($width).' '.$width.'w')->implode(', '),
                'sizes' => '(min-width: 768px) 25vw, 50vw',
            ];
        } elseif (preg_match('#^https?://#', $photo)) {
            $heroPreload = ['original' => $photo, 'initialImages' => $photos->all(), 'src' => $photo];
        } else {
            $src = str_starts_with($photo, '/') ? url($photo) : url('/storage/'.preg_replace('#^storage/#', '', $photo));
            $heroPreload = ['original' => $src, 'initialImages' => $photos->all(), 'src' => $src];
        }
    }

    return response()
        ->view('app', compact('heroPreload') + ['inlineHomepageCss' => true])
        ->header('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400')
        ->header('X-LiteSpeed-Cache-Control', 'public,max-age=60');
})->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);

Route::view('/{path?}', 'app')->where('path', '^(?!api|sanctum|up).*$');
