<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePaidProvider
{
    public function handle(Request $request, Closure $next): Response
    {
        if (! $request->user()?->isProvider() || ! $request->user()->hasPaidPlan()) {
            return new JsonResponse([
                'message' => 'This feature is available on the paid provider plan.',
                'upgrade_required' => true,
            ], 403);
        }

        return $next($request);
    }
}
