<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class OptionalAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($token = $request->bearerToken()) {
            if ($user = \Laravel\Sanctum\PersonalAccessToken::findToken($token)?->tokenable) {
                $request->setUserResolver(fn () => $user);
            }
        }

        return $next($request);
    }
}
