<?php

namespace App\Support;

use App\Models\AppSetting;
use App\Models\ProviderProfile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class HomepageShell
{
    public static function mediaUrl(?string $value): ?string
    {
        if (! $value) {
            return null;
        }

        if (preg_match('/^(https?:)?\/\//i', $value) || str_starts_with($value, '/')) {
            return $value;
        }

        return '/storage/'.preg_replace('/^storage\//', '', $value);
    }

    public static function responsiveUnsplash(string $src, array $widths = [280, 400, 560], int $quality = 70): array
    {
        if (! str_starts_with($src, 'https://images.unsplash.com/')) {
            return ['src' => $src];
        }

        $build = static function (int $width) use ($src, $quality): string {
            $parts = parse_url($src);
            parse_str($parts['query'] ?? '', $query);
            $query['auto'] = 'format';
            $query['fit'] = 'crop';
            $query['w'] = $width;
            $query['q'] = $quality;

            return ($parts['scheme'] ?? 'https').'://'.$parts['host'].($parts['path'] ?? '').'?'.http_build_query($query);
        };

        $widths = collect($widths)->unique()->sort()->values();

        return [
            'src' => $build($widths->last()),
            'srcset' => $widths->map(fn (int $width): string => $build($width).' '.$width.'w')->implode(', '),
            'sizes' => '(min-width: 768px) 25vw, 36vw',
        ];
    }

    public static function adminHeroImages(): array
    {
        if (! Schema::hasTable('app_settings')) {
            return [];
        }

        $raw = AppSetting::getValue('homepage.hero_images', '[]');
        $images = json_decode($raw, true);

        return is_array($images) ? array_values(array_filter($images, 'is_string')) : [];
    }

    public static function setAdminHeroImages(array $urls): void
    {
        AppSetting::setValue('homepage.hero_images', json_encode(array_values($urls)));
    }

    public static function heroImages(): array
    {
        $fallbacks = [
            'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=560&q=70',
            'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=560&q=70',
            'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=560&q=70',
            'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=560&q=70',
            'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=560&q=70',
            'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=560&q=70',
        ];

        // Admin-controlled images take priority
        $admin = self::adminHeroImages();
        if (count($admin) >= 2) {
            return array_slice($admin, 0, 8);
        }

        $photos = [];

        if (Schema::hasTable('provider_profiles')) {
            $photos = Cache::remember('home.hero.photos', 300, fn (): array => ProviderProfile::query()
                ->directory()
                ->whereNotNull('profile_photo')
                ->latest('updated_at')
                ->limit(8)
                ->pluck('profile_photo')
                ->map(fn (?string $photo): ?string => self::mediaUrl($photo))
                ->filter()
                ->values()
                ->all());
        }

        return collect($admin)->merge($photos)->merge($fallbacks)->filter()->unique()->take(8)->values()->all();
    }
}
