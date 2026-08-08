<?php

use App\Models\ProviderProfile;
use App\Http\Controllers\ProviderSeoController;
use App\Http\Controllers\SeoController;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\View\Middleware\ShareErrorsFromSession;

function bphq_media_url(?string $value): ?string
{
    if (! $value) {
        return null;
    }

    if (preg_match('/^(https?:)?\/\//i', $value) || str_starts_with($value, '/')) {
        return $value;
    }

    return '/storage/'.preg_replace('/^storage\//', '', $value);
}

function bphq_responsive_unsplash(string $src, array $widths = [280, 400, 560], int $quality = 70): array
{
    if (! str_starts_with($src, 'https://images.unsplash.com/')) {
        return ['src' => $src];
    }

    $build = static function (int $width) use ($src, $quality): string {
        $parts = parse_url($src);
        parse_str($parts['query'] ?? '', $query);
        $query['auto'] = 'format';
        $query['fit'] = 'crop';
        $query['w'] = $width;
        $query['q'] = $quality;

        return ($parts['scheme'] ?? 'https').'://'.$parts['host'].($parts['path'] ?? '').'?'.http_build_query($query);
    };

    $widths = collect($widths)->unique()->sort()->values();

    return [
        'src' => $build($widths->last()),
        'srcset' => $widths->map(fn (int $width): string => $build($width).' '.$width.'w')->implode(', '),
        'sizes' => '(min-width: 768px) 25vw, 36vw',
    ];
}

function bphq_home_hero_images(): array
{
    $fallbacks = [
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=560&q=70',
        'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=560&q=70',
        'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=560&q=70',
        'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=560&q=70',
        'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=560&q=70',
        'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=560&q=70',
    ];

    $photos = [];

    if (Schema::hasTable('provider_profiles')) {
        $photos = Cache::remember('home.hero.photos', 300, fn (): array => ProviderProfile::query()
            ->directory()
            ->whereNotNull('profile_photo')
            ->latest('updated_at')
            ->limit(8)
            ->pluck('profile_photo')
            ->map(fn (?string $photo): ?string => bphq_media_url($photo))
            ->filter()
            ->values()
            ->all());
    }

    return collect($photos)->merge($fallbacks)->filter()->unique()->take(8)->values()->all();
}

Route::get('/coming-soon', fn () => response()
    ->view('coming-soon')
    ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0'));

Route::get('/robots.txt', [SeoController::class, 'robots']);
Route::get('/llms.txt', [SeoController::class, 'llms']);
Route::get('/sitemap.xml', [SeoController::class, 'sitemap']);

Route::get('/', function () {
    $comingSoonEnabled = static function (): bool {
        if (! \Illuminate\Support\Facades\Schema::hasTable('app_settings')) {
            return app()->environment('production');
        }

        $value = \App\Models\AppSetting::getValue('features.coming_soon');

        return $value === null
            ? app()->environment('production')
            : $value === '1';
    };

    if ($comingSoonEnabled()) {
        return response()
            ->view('coming-soon')
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    $heroImages = bphq_home_hero_images();
    $heroPreload = bphq_responsive_unsplash($heroImages[0] ?? 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=560&q=70');

    return response()
        ->view('app', [
            'homepageShell' => true,
            'heroShellImages' => collect($heroImages)->map(fn (string $src): array => bphq_responsive_unsplash($src))->all(),
            'heroPreload' => [
                ...$heroPreload,
                'inline' => false,
                'initialImages' => $heroImages,
            ],
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

Route::get('/providers/{provider}.md', [SeoController::class, 'providerMarkdown'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);

Route::get('/providers/{provider}', [ProviderSeoController::class, 'show'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);

Route::get('/news-events/news/{news:slug}.md', [SeoController::class, 'newsMarkdown'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);
Route::get('/news-events/news/{news:slug}', [SeoController::class, 'newsPage'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);
Route::get('/news-events/events/{event:slug}.md', [SeoController::class, 'eventMarkdown'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);
Route::get('/news-events/events/{event:slug}', [SeoController::class, 'eventPage'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);
Route::get('/opportunities/{opportunity}.md', [SeoController::class, 'opportunityMarkdown'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);
Route::get('/opportunities/{opportunity}', [SeoController::class, 'opportunityPage'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);
Route::get('/community/{communityPost}.md', [SeoController::class, 'communityMarkdown'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);
Route::get('/community/{communityPost}', [SeoController::class, 'communityPage'])->withoutMiddleware([
    StartSession::class,
    ShareErrorsFromSession::class,
    PreventRequestForgery::class,
]);

Route::get('/{path?}', function (?string $path = null) {
    $path = trim((string) $path, '/');
    $firstSegment = strtok($path, '/') ?: '';
    $comingSoonBypass = in_array($firstSegment, [
        'login',
        'register',
        'forgot-password',
        'reset-password',
        'verify-email',
        'admin',
        'provider',
        'customer',
        'coming-soon',
    ], true);

    $comingSoonEnabled = static function (): bool {
        if (! \Illuminate\Support\Facades\Schema::hasTable('app_settings')) {
            return app()->environment('production');
        }

        $value = \App\Models\AppSetting::getValue('features.coming_soon');

        return $value === null
            ? app()->environment('production')
            : $value === '1';
    };

    if (! $comingSoonBypass && $comingSoonEnabled()) {
        return response()
            ->view('coming-soon')
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    }

    return view('app');
})->where('path', '^(?!api|sanctum|up).*$');
