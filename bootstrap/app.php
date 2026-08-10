<?php

use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureActiveAccount;
use App\Http\Middleware\EnsurePaidProvider;
use App\Http\Middleware\EnsureVerifiedProvider;
use App\Http\Middleware\RequestContext;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Http\Request;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->throttleApi('api');
        $middleware->trustHosts(at: fn (): array => config('app.trusted_hosts', []));
        $middleware->validateCsrfTokens(except: [
            'api/newsletter/subscribe',
            'api/admin/*',
        ]);

        $middleware->append([
            RequestContext::class,
            SecurityHeaders::class,
        ]);
        $middleware->alias([
            'active' => EnsureActiveAccount::class,
            'role' => EnsureRole::class,
            'paid.provider' => EnsurePaidProvider::class,
            'verified.provider' => EnsureVerifiedProvider::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->dontReportDuplicates();
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request, \Throwable $exception): bool => $request->is('api/*') || $request->expectsJson()
        );
        $exceptions->context(fn (): array => array_filter([
            'request_id' => request()?->attributes->get('request_id'),
            'method' => request()?->method(),
            'path' => request()?->path(),
            'route' => request()?->route()?->getName(),
        ]));
    })->create();
