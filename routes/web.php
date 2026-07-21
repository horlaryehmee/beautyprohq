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
    $fallbackPhotos = [
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1559599101-f09722fb4948?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1526045478516-99145907023c?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1488282396544-0212eea56a21?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1519415943484-9fa1873496d4?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=900&q=80',
        'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80',
    ];
    $inlineHeroPath = resource_path('data/homepage-hero.webp.b64');
    $inlineHero = is_file($inlineHeroPath)
        ? 'data:image/webp;base64,'.trim(file_get_contents($inlineHeroPath))
        : null;
    $formatPhoto = static function (string $photo) use ($inlineHero): array {
        if ($inlineHero && str_contains($photo, 'photo-1524504388940-b1c1722653e1')) {
            return [
                'original' => $inlineHero,
                'src' => $inlineHero,
                'inline' => true,
            ];
        }

        if (str_starts_with($photo, 'https://images.unsplash.com/')) {
            $parts = parse_url($photo);
            parse_str($parts['query'] ?? '', $query);
            $base = ($parts['scheme'] ?? 'https').'://'.$parts['host'].($parts['path'] ?? '');
            $build = static function (int $width) use ($base, $query): string {
                return $base.'?'.http_build_query([...$query, 'auto' => 'format', 'fit' => 'crop', 'w' => $width, 'q' => 70]);
            };

            return [
                'original' => $photo,
                'src' => $build(560),
                'srcset' => collect([280, 400, 560])->map(fn (int $width) => $build($width).' '.$width.'w')->implode(', '),
                'sizes' => '(min-width: 768px) 25vw, 36vw',
            ];
        }

        if (preg_match('#^https?://#', $photo)) {
            return ['original' => $photo, 'src' => $photo];
        }

        $src = str_starts_with($photo, '/') ? url($photo) : url('/storage/'.preg_replace('#^storage/#', '', $photo));

        return ['original' => $src, 'src' => $src];
    };
    $heroSources = collect([...$photos->all(), ...$fallbackPhotos])->take(16)->values();
    $heroShellImages = $heroSources->map($formatPhoto)->all();
    $heroPreload = $formatPhoto($heroSources->first());
    $heroPreload['initialImages'] = collect($heroShellImages)->pluck('original')->values()->all();

    return response()
        ->view('app', compact('heroPreload', 'heroShellImages') + [
            'homepageShell' => true,
            'inlineHomepageCss' => true,
            'pageTitle' => 'The Beauty Service Ecosystem | BeautyPro HQ',
            'pageDescription' => 'Discover trusted beauty professionals, stay updated on industry news and events, and connect with opportunities across the beauty industry.',
        ])
        ->header('Cache-Control', 'public, max-age=0, s-maxage=60, must-revalidate, no-transform')
        ->header('X-LiteSpeed-Cache-Control', 'public,max-age=60');
})->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);

Route::view('/{path?}', 'app')->where('path', '^(?!api|sanctum|up).*$');
