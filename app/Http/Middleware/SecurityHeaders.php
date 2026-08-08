<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        Vite::useCspNonce();

        $response = $next($request);
        $headers = $response->headers;

        $headers->set('X-Content-Type-Options', 'nosniff');
        $headers->set('X-Frame-Options', 'SAMEORIGIN');
        $headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $headers->set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(self)');
        $headers->set('X-Permitted-Cross-Domain-Policies', 'none');
        $headers->set('X-XSS-Protection', '0');
        $headers->remove('X-Powered-By');

        if (config('security.csp.enabled', true)) {
            $headers->set('Content-Security-Policy', $this->contentSecurityPolicy($request, $response));
        }

        if ($request->isSecure() && config('security.hsts.enabled', true)) {
            $headers->set('Strict-Transport-Security', 'max-age='.(int) config('security.hsts.max_age', 31536000).'; includeSubDomains');
        }

        if ($this->isPrivateResponse($request)) {
            $headers->set('Cache-Control', 'no-store, private, max-age=0');
            $headers->set('Pragma', 'no-cache');
        }

        return $response;
    }

    private function contentSecurityPolicy(Request $request, Response $response): string
    {
        $nonce = Vite::cspNonce();
        $scriptSources = ["'self'"];

        if ($nonce) {
            $scriptSources[] = "'nonce-{$nonce}'";
        }
        $scriptSources = [...$scriptSources, ...$this->inlineScriptHashes($response)];

        $connectSources = ["'self'"];
        if (app()->isLocal()) {
            $scriptSources = [...$scriptSources, "'unsafe-eval'", 'http://localhost:5173', 'http://127.0.0.1:5173'];
            $connectSources = [...$connectSources, 'http://localhost:5173', 'http://127.0.0.1:5173', 'ws://localhost:5173', 'ws://127.0.0.1:5173'];
        }

        $directives = [
            "default-src 'self'",
            "base-uri 'self'",
            "object-src 'none'",
            "frame-ancestors 'self'",
            "form-action 'self'",
            'script-src '.implode(' ', $scriptSources),
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com data:",
            "img-src 'self' https: data: blob:",
            "media-src 'self' https: data: blob:",
            'connect-src '.implode(' ', $connectSources),
            "worker-src 'self' blob:",
            "manifest-src 'self'",
        ];

        if ($request->isSecure() && config('security.csp.upgrade_insecure_requests', true)) {
            $directives[] = 'upgrade-insecure-requests';
        }

        return implode('; ', $directives);
    }

    private function inlineScriptHashes(Response $response): array
    {
        $content = (string) $response->getContent();
        if (! str_contains($content, '<script')) {
            return [];
        }

        preg_match_all('/<script(?:\s[^>]*)?>(.*?)<\/script>/is', $content, $matches);

        return collect($matches[1] ?? [])
            ->map(fn (string $script): string => "'sha256-".base64_encode(hash('sha256', $script, true))."'")
            ->unique()
            ->values()
            ->all();
    }

    private function isPrivateResponse(Request $request): bool
    {
        if (! $request->isMethodSafe()) {
            return true;
        }

        if ($request->user()) {
            return true;
        }

        return $request->is([
            'api/auth/*',
            'api/customer/*',
            'api/provider/*',
            'api/admin/*',
            'admin*',
            'customer*',
            'provider*',
            'login',
            'register',
            'forgot-password',
            'reset-password*',
            'verify-email*',
        ]);
    }
}
