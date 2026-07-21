<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use Illuminate\Http\JsonResponse;

class CurrencyController extends Controller
{
    public function index(): JsonResponse
    {
        $default = AppSetting::getValue('currency.default') ?: config('currencies.default', 'NGN');
        $savedRates = json_decode((string) AppSetting::getValue('currency.rates', ''), true) ?: [];
        $supported = collect(config('currencies.supported', []))
            ->map(fn (array $currency, string $code): array => [
                'code' => $code,
                'name' => $currency['name'],
                'symbol' => $currency['symbol'],
                'rate' => (float) ($savedRates[$code] ?? $currency['rate']),
            ])
            ->values();

        return $this->success([
            'default' => $default,
            'supported' => $supported,
        ]);
    }
}
