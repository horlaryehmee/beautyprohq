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

    return response()
        ->view('app', [
            'homepageShell' => false,
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
