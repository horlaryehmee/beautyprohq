<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureVerifiedProvider
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->providerProfile?->verified) {
            return new JsonResponse(['message' => 'This feature is available to verified providers.'], 403);
        }

        return $next($request);
    }
}
