<?php

namespace App\Http\Controllers;

use App\Models\ProviderProfile;
use Illuminate\Http\Response;

class SeoController extends Controller
{
    public function robots(): Response
    {
        return response(implode("\n", [
            'User-agent: *',
            'Allow: /',
            'Disallow: /admin',
            'Disallow: /provider',
            'Disallow: /customer',
            'Sitemap: '.url('/sitemap.xml'),
            '',
        ]), 200)->header('Content-Type', 'text/plain');
    }

    public function sitemap(): Response
    {
        $staticUrls = [
            ['loc' => url('/'), 'priority' => '1.0'],
            ['loc' => url('/directory'), 'priority' => '0.9'],
        ];

        $providerUrls = ProviderProfile::directory()
            ->select(['id', 'slug', 'updated_at'])
            ->latest('updated_at')
            ->get()
            ->map(fn (ProviderProfile $provider) => [
                'loc' => url('/providers/'.$provider->slug),
                'lastmod' => optional($provider->updated_at)->toAtomString(),
                'priority' => '0.8',
            ])
            ->all();

        $urls = collect([...$staticUrls, ...$providerUrls])->map(function (array $url): string {
            $lastmod = isset($url['lastmod']) ? '<lastmod>'.$this->xml($url['lastmod']).'</lastmod>' : '';

            return '<url><loc>'.$this->xml($url['loc']).'</loc>'.$lastmod.'<changefreq>daily</changefreq><priority>'.$url['priority'].'</priority></url>';
        })->implode('');

        return response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'.$urls.'</urlset>', 200)
            ->header('Content-Type', 'application/xml');
    }

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_COMPAT, 'UTF-8');
    }
}
