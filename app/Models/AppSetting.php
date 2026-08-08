<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;

class AppSetting extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'encrypted' => 'boolean',
        ];
    }

    public static function getValue(string $key, mixed $default = null): mixed
    {
        try {
            $setting = Cache::remember(
                static::cacheKey($key),
                now()->addMinutes(5),
                fn (): ?array => static::where('key', $key)->first(['value', 'encrypted'])?->only(['value', 'encrypted'])
            );
        } catch (\Throwable) {
            $setting = static::where('key', $key)->first(['value', 'encrypted'])?->only(['value', 'encrypted']);
        }

        if (! $setting) {
            return $default;
        }

        if (! $setting['encrypted']) {
            return $setting['value'] ?? $default;
        }

        try {
            return $setting['value'] ? Crypt::decryptString($setting['value']) : $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    public static function setValue(string $key, mixed $value, bool $encrypted = false): void
    {
        static::updateOrCreate(
            ['key' => $key],
            [
                'value' => blank($value) ? null : ($encrypted ? Crypt::encryptString((string) $value) : (string) $value),
                'encrypted' => $encrypted,
            ],
        );

        Cache::forget(static::cacheKey($key));
    }

    private static function cacheKey(string $key): string
    {
        return 'app-setting:'.hash('sha256', $key);
    }
}
