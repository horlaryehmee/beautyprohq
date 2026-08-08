<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class RequestContext
{
    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $this->requestId($request);
        $startedAt = hrtime(true);

        $request->attributes->set('request_id', $requestId);
        Log::withContext([
            'request_id' => $requestId,
            'method' => $request->method(),
            'path' => $request->path(),
        ]);

        $response = $next($request);
        $durationMs = (hrtime(true) - $startedAt) / 1_000_000;

        $response->headers->set('X-Request-ID', $requestId);

        if ($durationMs >= (float) config('operations.slow_request_ms', 1500)) {
            Log::warning('Slow request completed.', [
                'duration_ms' => round($durationMs, 1),
                'status' => $response->getStatusCode(),
                'route' => $request->route()?->getName(),
                'user_id' => $request->user()?->id,
            ]);
        }

        return $response;
    }

    private function requestId(Request $request): string
    {
        $incoming = trim((string) $request->header('X-Request-ID'));

        if ($incoming !== '' && preg_match('/^[A-Za-z0-9._-]{8,100}$/', $incoming) === 1) {
            return $incoming;
        }

        return (string) Str::uuid();
    }
}
