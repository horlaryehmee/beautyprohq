<?php

namespace App\Http\Controllers;

use App\Models\ProviderProfile;
use Illuminate\Support\Str;
use Illuminate\View\View;

class ProviderSeoController extends Controller
{
    public function show(ProviderProfile $provider): View
    {
        abort_unless($provider->is_listed && $provider->user?->is_active, 404);

        $provider->load([
            'user:id,name,is_active',
            'category:id,name,slug',
            'services' => fn ($query) => $query->where('is_active', true)->orderBy('price')->limit(6),
        ]);

        $name = $provider->user?->name ?? 'Beauty professional';
        $profession = $provider->profession ?: $provider->category?->name ?: 'Beauty professional';
        $location = $provider->city ?: $provider->location ?: $provider->country ?: 'Nigeria';
        $serviceNames = $provider->services->pluck('name')->filter()->take(4)->values();
        $serviceSummary = $serviceNames->isNotEmpty() ? ' Services include '.$serviceNames->implode(', ').'.' : '';
        $description = $provider->bio
            ? Str::limit(trim(strip_tags($provider->bio)), 155, '')
            : Str::limit("Book {$name}, {$profession} in {$location}, on BeautyPro HQ.{$serviceSummary}", 155, '');
        $canonical = url('/providers/'.$provider->slug);
        $image = $this->absoluteMediaUrl($provider->profile_photo ?: $provider->cover_image);

        $structuredData = array_filter([
            '@context' => 'https://schema.org',
            '@type' => 'BeautySalon',
            'name' => $name,
            'description' => $description,
            'url' => $canonical,
            'image' => $image,
            'telephone' => $provider->contact_phone,
            'email' => $provider->contact_email,
            'address' => array_filter([
                '@type' => 'PostalAddress',
                'addressLocality' => $provider->city ?: $provider->location,
                'addressCountry' => $provider->country ?: 'NG',
            ]),
            'aggregateRating' => ((float) $provider->rating > 0 && (int) $provider->review_count > 0) ? [
                '@type' => 'AggregateRating',
                'ratingValue' => (float) $provider->rating,
                'reviewCount' => (int) $provider->review_count,
                'bestRating' => 5,
                'worstRating' => 1,
            ] : null,
            'makesOffer' => $provider->services->map(fn ($service) => array_filter([
                '@type' => 'Offer',
                'name' => $service->name,
                'description' => $service->description,
                'price' => (float) $service->price,
                'priceCurrency' => $provider->default_currency ?: 'NGN',
            ]))->values()->all(),
        ]);

        return view('app', [
            'pageTitle' => "{$name} - {$profession} in {$location} | BeautyPro HQ",
            'pageDescription' => $description,
            'pageCanonical' => $canonical,
            'pageImage' => $image,
            'pageType' => 'profile',
            'pageRobots' => 'index, follow',
            'structuredData' => $structuredData,
        ]);
    }

    private function absoluteMediaUrl(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        if (preg_match('#^https?://#', $path)) {
            return $path;
        }

        if (str_starts_with($path, '/')) {
            return url($path);
        }

        return url('/storage/'.preg_replace('#^storage/#', '', $path));
    }
}
