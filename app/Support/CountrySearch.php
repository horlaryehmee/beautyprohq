<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

class CountrySearch
{
    private const ALIASES = [
        'US' => ['USA', 'America', 'United State', 'United States of America'],
        'GB' => ['UK', 'Great Britain', 'Britain'],
        'AE' => ['UAE'],
    ];

    public static function match(string $value): ?array
    {
        $countries = json_decode((string) file_get_contents(__DIR__.'/countries.json'), true);
        $needle = mb_strtolower(trim($value));
        foreach ($countries as $code => $name) {
            $names = array_merge([$name], self::ALIASES[$code] ?? []);
            if ($needle === mb_strtolower($code) || in_array($needle, array_map('mb_strtolower', $names), true)) {
                return ['code' => $code, 'names' => $names];
            }
        }

        return null;
    }

    public static function addConditions(Builder $query, string $value): void
    {
        $country = self::match($value);
        if (! $country) {
            return;
        }

        $query->orWhere('country', $country['code']);
        foreach ($country['names'] as $name) {
            $query->orWhere('country', $name)
                ->orWhere('location', 'like', "%{$name}%");
        }

        // Country codes in addresses need a word boundary: searching NG must
        // not match the middle of an unrelated place name.
        $code = $country['code'];
        $query->orWhere('location', $code)
            ->orWhere('location', 'like', "%, {$code}")
            ->orWhere('location', 'like', "%, {$code},%")
            ->orWhere('location', 'like', "% ({$code})%");
    }
}
