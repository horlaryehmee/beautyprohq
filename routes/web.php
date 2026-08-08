<?php

use App\Models\NewsletterSubscriber;
use App\Http\Controllers\ProviderSeoController;
use App\Http\Controllers\SeoController;
use App\Support\HomepageShell;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
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

    $heroImages = HomepageShell::heroImages();
    $heroPreload = HomepageShell::responsiveUnsplash($heroImages[0] ?? 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=560&q=70');

    return response()
        ->view('app', [
            'homepageShell' => true,
            'heroShellImages' => collect($heroImages)->map(fn (string $src): array => HomepageShell::responsiveUnsplash($src))->all(),
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

Route::get('/build/assets/{asset}', fn () => abort(404))->where('asset', '.*');

Route::get('/newsletter/unsubscribe/{subscriber}', function (NewsletterSubscriber $subscriber) {
    $subscriber->forceFill(['unsubscribed_at' => now()])->save();

    return response(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head><body style="font-family:Arial,sans-serif;max-width:620px;margin:48px auto;padding:0 20px;line-height:1.6;color:#24160f"><h1>You have been unsubscribed.</h1><p>You will no longer receive BeautyPro HQ newsletter updates at this email address.</p><p><a href="/" style="color:#9f1239;font-weight:700">Return to BeautyPro HQ</a></p></body></html>',
        200,
        ['Content-Type' => 'text/html; charset=UTF-8']
    );
})->middleware('signed')->name('newsletter.unsubscribe');

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

    $response = response()->view('app');

    if ($comingSoonBypass) {
        return $response
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }

    return $response;
})->where('path', '^(?!api|sanctum|up).*$');
