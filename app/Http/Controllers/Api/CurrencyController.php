<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class CurrencyController extends Controller
{
    public function index(): JsonResponse
    {
        $supported = collect(config('currencies.supported', []))
            ->map(fn (array $currency, string $code) => [
                'code' => $code,
                'name' => $currency['name'],
                'symbol' => $currency['symbol'],
                'rate' => $currency['rate'],
            ])
            ->values();

        return $this->success([
            'default' => config('currencies.default', 'NGN'),
            'supported' => $supported,
        ]);
    }
}
