<?php

use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;

$hostWithPort = static function (?string $url): ?string {
    if (! $url) {
        return null;
    }

    $host = parse_url($url, PHP_URL_HOST);
    $port = parse_url($url, PHP_URL_PORT);

    if (! $host) {
        return null;
    }

    return $port ? "{$host}:{$port}" : $host;
};

$configuredStateful = array_filter(explode(',', (string) env('SANCTUM_STATEFUL_DOMAINS', '')));
$defaultStateful = [
    'localhost',
    'localhost:3000',
    'localhost:5173',
    'localhost:5174',
    'localhost:8000',
    'localhost:8001',
    '127.0.0.1',
    '127.0.0.1:8000',
    '127.0.0.1:8001',
    '127.0.0.1:5173',
    '127.0.0.1:5174',
    '::1',
    $hostWithPort(env('APP_URL')),
    $hostWithPort(env('FRONTEND_URL')),
];

return [
    'stateful' => array_values(array_filter(array_unique(array_merge($defaultStateful, $configuredStateful)))),

    'guard' => ['web'],

    'expiration' => null,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'encrypt_cookies' => EncryptCookies::class,
        'validate_csrf_token' => ValidateCsrfToken::class,
    ],
];
