<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class StatusController extends Controller
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('select 1');
            $key = (string) config('operations.health_cache_key', 'health:last-check');
            $value = Str::random(16);
            Cache::put($key, $value, 30);

            if (! hash_equals($value, (string) Cache::get($key))) {
                throw new \RuntimeException('Cache check failed.');
            }
        } catch (\Throwable $exception) {
            Log::error('Application health check failed.', [
                'exception' => $exception::class,
                'request_id' => request()->attributes->get('request_id'),
            ]);

            return response()->json([
                'data' => ['status' => 'unavailable'],
                'message' => 'The service is temporarily unavailable.',
            ], 503);
        }

        return $this->success([
            'status' => 'ok',
            'name' => 'BeautyPro HQ API',
            'request_id' => request()->attributes->get('request_id'),
        ])->header('Cache-Control', 'no-store');
    }
}
