<?php

namespace App\Support;

use App\Models\AppSetting;
use App\Models\SubscriptionPlan;
use Illuminate\Http\Request;

class CurrencyResolver
{
    private const COUNTRY_CURRENCY = [
        'NG' => 'NGN',
        'US' => 'USD',
        'GB' => 'GBP',
        'IE' => 'EUR',
        'FR' => 'EUR',
        'DE' => 'EUR',
        'ES' => 'EUR',
        'IT' => 'EUR',
        'NL' => 'EUR',
        'BE' => 'EUR',
        'PT' => 'EUR',
        'AT' => 'EUR',
        'FI' => 'EUR',
        'GR' => 'EUR',
        'LU' => 'EUR',
    ];

    private const TIMEZONE_CURRENCY = [
        'Africa/Lagos' => 'NGN',
        'America/New_York' => 'USD',
        'America/Chicago' => 'USD',
        'America/Denver' => 'USD',
        'America/Los_Angeles' => 'USD',
        'Europe/London' => 'GBP',
        'Europe/Dublin' => 'EUR',
        'Europe/Paris' => 'EUR',
        'Europe/Berlin' => 'EUR',
        'Europe/Madrid' => 'EUR',
        'Europe/Rome' => 'EUR',
        'Europe/Amsterdam' => 'EUR',
    ];

    public static function defaultCurrency(): string
    {
        return self::validCurrency(AppSetting::getValue('currency.default') ?: config('currencies.default', 'NGN')) ?? 'NGN';
    }

    public static function currencyForRequest(Request $request): string
    {
        return self::validCurrency($request->header('X-BPHQ-Currency'))
            ?? self::validCurrency($request->query('currency'))
            ?? self::currencyFromCountry($request->header('X-BPHQ-Country'))
            ?? self::currencyFromCountry($request->header('CF-IPCountry'))
            ?? self::currencyFromCountry($request->header('X-Vercel-IP-Country'))
            ?? self::currencyFromCountry($request->header('X-Appengine-Country'))
            ?? self::currencyFromTimezone($request->header('X-BPHQ-Timezone'))
            ?? self::currencyFromAcceptLanguage($request->header('Accept-Language'))
            ?? self::defaultCurrency();
    }

    public static function rates(): array
    {
        $savedRates = json_decode((string) AppSetting::getValue('currency.rates', ''), true) ?: [];

        return collect(config('currencies.supported', []))
            ->mapWithKeys(fn (array $currency, string $code): array => [$code => (float) ($savedRates[$code] ?? $currency['rate'])])
            ->all();
    }

    public static function supportedPayload(): array
    {
        $rates = self::rates();

        return collect(config('currencies.supported', []))
            ->map(fn (array $currency, string $code): array => [
                'code' => $code,
                'name' => $currency['name'],
                'symbol' => $currency['symbol'],
                'rate' => (float) ($rates[$code] ?? $currency['rate']),
            ])
            ->values()
            ->all();
    }

    public static function planPayload(SubscriptionPlan $plan, string $displayCurrency): array
    {
        $baseCurrency = $plan->currency ?: self::defaultCurrency();
        $displayCurrency = self::validCurrency($displayCurrency) ?? $baseCurrency;

        return $plan->toArray() + [
            'billing_price' => (float) $plan->price,
            'billing_currency' => $baseCurrency,
            'display_price' => self::convert((float) $plan->price, $baseCurrency, $displayCurrency),
            'display_currency' => $displayCurrency,
        ];
    }

    public static function convert(float $amount, string $from, string $to): float
    {
        $rates = self::rates();
        $fromRate = (float) ($rates[$from] ?? 1);
        $toRate = (float) ($rates[$to] ?? 1);

        if ($from === $to || $fromRate <= 0 || $toRate <= 0) {
            return round($amount, 2);
        }

        return round(($amount / $fromRate) * $toRate, 2);
    }

    private static function currencyFromAcceptLanguage(?string $header): ?string
    {
        if (! $header) {
            return null;
        }

        preg_match_all('/(?:^|,)\s*[a-z]{2,3}[-_]([A-Z]{2})/i', $header, $matches);

        foreach ($matches[1] ?? [] as $country) {
            $currency = self::currencyFromCountry($country);
            if ($currency) {
                return $currency;
            }
        }

        return null;
    }

    private static function currencyFromCountry(?string $country): ?string
    {
        $country = strtoupper(trim((string) $country));

        return self::validCurrency(self::COUNTRY_CURRENCY[$country] ?? null);
    }

    private static function currencyFromTimezone(?string $timezone): ?string
    {
        return self::validCurrency(self::TIMEZONE_CURRENCY[(string) $timezone] ?? null);
    }

    private static function validCurrency(?string $currency): ?string
    {
        $currency = strtoupper(trim((string) $currency));

        return array_key_exists($currency, config('currencies.supported', [])) ? $currency : null;
    }
}
