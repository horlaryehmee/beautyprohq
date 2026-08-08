<?php

namespace App\Http\Controllers;

use App\Models\CommunityPost;
use App\Models\Event;
use App\Models\News;
use App\Models\Opportunity;
use App\Models\ProviderProfile;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Illuminate\View\View;

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
            '# LLMs: '.url('/llms.txt'),
            '',
        ]), 200)->header('Content-Type', 'text/plain');
    }

    public function llms(): Response
    {
        $lines = [
            '# BeautyPro HQ',
            '',
            '> BeautyPro HQ helps customers discover trusted beauty professionals, book services, follow beauty industry updates, and find events and opportunities.',
            '',
            '## Core Pages',
            '- [Home]('.url('/').'): BeautyPro HQ discovery, booking, provider tools, and beauty industry hub.',
            '- [Directory]('.url('/directory').'): Browse listed beauty professionals and services.',
            '- [News]('.url('/news').'): Beauty industry news, insights, and guides.',
            '- [Events]('.url('/events').'): Beauty events, workshops, and networking opportunities.',
            '- [Opportunities]('.url('/opportunities').'): Beauty jobs, grants, partnerships, and calls for talent.',
            '- [Community]('.url('/community').'): Provider stories, spotlights, and community updates.',
            '',
            '## Markdown Mirrors',
            '- [Full sitemap]('.url('/sitemap.xml').')',
        ];

        $this->providerItems()->take(100)->each(function (ProviderProfile $provider) use (&$lines): void {
            $name = $provider->user?->name ?? 'Beauty professional';
            $profession = $provider->profession ?: $provider->category?->name ?: 'Beauty professional';
            $lines[] = '- ['.$this->plain("{$name} - {$profession}").']('.url('/providers/'.$provider->slug.'.md').')';
        });

        $this->newsItems()->take(100)->each(fn (News $news) => $lines[] = '- ['.$this->plain($news->title).']('.url('/news-events/news/'.$news->slug.'.md').')');
        $this->eventItems()->take(100)->each(fn (Event $event) => $lines[] = '- ['.$this->plain($event->title).']('.url('/news-events/events/'.$event->slug.'.md').')');
        $this->opportunityItems()->take(100)->each(fn (Opportunity $opportunity) => $lines[] = '- ['.$this->plain($opportunity->title).']('.url('/opportunities/'.$opportunity->id.'.md').')');
        $this->communityItems()->take(100)->each(fn (CommunityPost $post) => $lines[] = '- ['.$this->plain($post->title).']('.url('/community/'.$post->slug.'.md').')');

        $lines[] = '';

        return response(implode("\n", $lines), 200)
            ->header('Content-Type', 'text/markdown; charset=UTF-8')
            ->header('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800')
            ->header('X-LiteSpeed-Cache-Control', 'public,max-age=600');
    }

    public function sitemap(): Response
    {
        $staticUrls = [
            ['loc' => url('/'), 'priority' => '1.0', 'changefreq' => 'daily'],
            ['loc' => url('/directory'), 'priority' => '0.9', 'changefreq' => 'daily'],
            ['loc' => url('/news'), 'priority' => '0.8', 'changefreq' => 'daily'],
            ['loc' => url('/events'), 'priority' => '0.8', 'changefreq' => 'daily'],
            ['loc' => url('/opportunities'), 'priority' => '0.8', 'changefreq' => 'weekly'],
            ['loc' => url('/community'), 'priority' => '0.7', 'changefreq' => 'weekly'],
            ['loc' => url('/privacy-policy'), 'priority' => '0.3', 'changefreq' => 'yearly'],
            ['loc' => url('/terms-and-conditions'), 'priority' => '0.3', 'changefreq' => 'yearly'],
        ];

        $providerUrls = $this->providerItems()
            ->map(fn (ProviderProfile $provider) => [
                'loc' => url('/providers/'.$provider->slug),
                'lastmod' => optional($provider->updated_at)->toAtomString(),
                'priority' => '0.8',
                'changefreq' => 'weekly',
            ])
            ->values();

        $contentUrls = collect()
            ->merge($this->newsItems()->map(fn (News $news) => [
                'loc' => url('/news-events/news/'.$news->slug),
                'lastmod' => optional($news->updated_at ?: $news->published_at)->toAtomString(),
                'priority' => '0.75',
                'changefreq' => 'monthly',
            ]))
            ->merge($this->eventItems()->map(fn (Event $event) => [
                'loc' => url('/news-events/events/'.$event->slug),
                'lastmod' => optional($event->updated_at ?: $event->published_at)->toAtomString(),
                'priority' => '0.75',
                'changefreq' => 'weekly',
            ]))
            ->merge($this->opportunityItems()->map(fn (Opportunity $opportunity) => [
                'loc' => url('/opportunities/'.$opportunity->id),
                'lastmod' => optional($opportunity->updated_at ?: $opportunity->published_at)->toAtomString(),
                'priority' => '0.7',
                'changefreq' => 'weekly',
            ]))
            ->merge($this->communityItems()->map(fn (CommunityPost $post) => [
                'loc' => url('/community/'.$post->slug),
                'lastmod' => optional($post->updated_at ?: $post->published_at)->toAtomString(),
                'priority' => '0.65',
                'changefreq' => 'monthly',
            ]));

        $urls = collect($staticUrls)->merge($providerUrls)->merge($contentUrls)->map(function (array $url): string {
            $lastmod = isset($url['lastmod']) ? '<lastmod>'.$this->xml($url['lastmod']).'</lastmod>' : '';
            $changefreq = '<changefreq>'.$this->xml($url['changefreq'] ?? 'weekly').'</changefreq>';

            return '<url><loc>'.$this->xml($url['loc']).'</loc>'.$lastmod.$changefreq.'<priority>'.$url['priority'].'</priority></url>';
        })->implode('');

        return response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'.$urls.'</urlset>', 200)
            ->header('Content-Type', 'application/xml')
            ->header('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800')
            ->header('X-LiteSpeed-Cache-Control', 'public,max-age=600');
    }

    public function providerMarkdown(ProviderProfile $provider): Response
    {
        abort_unless($provider->is_listed && $provider->user?->is_active, 404);
        $provider->load(['user:id,name,is_active', 'category:id,name', 'services' => fn ($query) => $query->where('is_active', true)->orderBy('price')]);

        return $this->markdownResponse($this->providerMarkdownBody($provider));
    }

    public function newsPage(News $news): View
    {
        abort_unless($news->published_at?->lte(now()), 404);

        return view('app', $this->contentMeta(
            $news->seo_title ?: $news->title.' | BeautyPro HQ',
            $news->seo_description ?: $this->summary($news->excerpt ?: $news->content, 160),
            url('/news-events/news/'.$news->slug),
            $news->image,
            'article',
            [
                '@context' => 'https://schema.org',
                '@type' => 'Article',
                'headline' => $news->seo_title ?: $news->title,
                'description' => $news->seo_description ?: $this->summary($news->excerpt ?: $news->content, 220),
                'datePublished' => optional($news->published_at)->toAtomString(),
                'dateModified' => optional($news->updated_at)->toAtomString(),
                'image' => $this->absoluteMediaUrl($news->image),
            ],
        ));
    }

    public function newsMarkdown(News $news): Response
    {
        abort_unless($news->published_at?->lte(now()), 404);

        return $this->markdownResponse($this->contentMarkdownBody(
            $news->seo_title ?: $news->title,
            $news->seo_description ?: $news->excerpt,
            url('/news-events/news/'.$news->slug),
            $news->published_at,
            $news->updated_at,
            $news->content,
        ));
    }

    public function eventPage(Event $event): View
    {
        abort_unless($event->published_at?->lte(now()), 404);

        return view('app', $this->contentMeta(
            $event->seo_title ?: $event->title.' | Beauty Events | BeautyPro HQ',
            $event->seo_description ?: $this->summary($event->description, 160),
            url('/news-events/events/'.$event->slug),
            $event->image,
            'event',
            [
                '@context' => 'https://schema.org',
                '@type' => 'Event',
                'name' => $event->seo_title ?: $event->title,
                'description' => $event->seo_description ?: $this->summary($event->description, 220),
                'startDate' => optional($event->date)->toAtomString(),
                'location' => $event->location,
                'image' => $this->absoluteMediaUrl($event->image),
            ],
        ));
    }

    public function eventMarkdown(Event $event): Response
    {
        abort_unless($event->published_at?->lte(now()), 404);

        return $this->markdownResponse($this->contentMarkdownBody(
            $event->seo_title ?: $event->title,
            $event->seo_description,
            url('/news-events/events/'.$event->slug),
            $event->published_at,
            $event->updated_at,
            $event->description,
            ['Date' => optional($event->date)->toFormattedDateString(), 'Location' => $event->location],
        ));
    }

    public function opportunityPage(Opportunity $opportunity): View
    {
        abort_unless($opportunity->published_at?->lte(now()), 404);

        return view('app', $this->contentMeta(
            $opportunity->title.' | Beauty Opportunity | BeautyPro HQ',
            $this->summary($opportunity->description, 160),
            url('/opportunities/'.$opportunity->id),
            null,
            'article',
            [
                '@context' => 'https://schema.org',
                '@type' => 'JobPosting',
                'title' => $opportunity->title,
                'description' => $this->plain($opportunity->description),
                'datePosted' => optional($opportunity->published_at)->toDateString(),
                'validThrough' => optional($opportunity->deadline)->toDateString(),
                'employmentType' => $opportunity->type,
                'jobLocation' => $opportunity->location,
            ],
        ));
    }

    public function opportunityMarkdown(Opportunity $opportunity): Response
    {
        abort_unless($opportunity->published_at?->lte(now()), 404);

        return $this->markdownResponse($this->contentMarkdownBody(
            $opportunity->title,
            null,
            url('/opportunities/'.$opportunity->id),
            $opportunity->published_at,
            $opportunity->updated_at,
            $opportunity->description,
            ['Type' => $opportunity->type, 'Location' => $opportunity->location, 'Deadline' => optional($opportunity->deadline)->toFormattedDateString()],
        ));
    }

    public function communityPage(CommunityPost $communityPost): View|RedirectResponse
    {
        abort_unless($communityPost->published_at?->lte(now()), 404);
        $canonical = url('/community/'.$communityPost->slug);

        if (url()->current() !== $canonical) {
            return redirect()->to($canonical, 301);
        }

        return view('app', $this->contentMeta(
            $communityPost->seo_title ?: $communityPost->title.' | Beauty Community | BeautyPro HQ',
            $communityPost->seo_description ?: $this->summary($communityPost->content, 160),
            $canonical,
            $communityPost->image,
            'article',
            [
                '@context' => 'https://schema.org',
                '@type' => 'Article',
                'headline' => $communityPost->seo_title ?: $communityPost->title,
                'description' => $communityPost->seo_description ?: $this->summary($communityPost->content, 220),
                'datePublished' => optional($communityPost->published_at)->toAtomString(),
                'dateModified' => optional($communityPost->updated_at)->toAtomString(),
                'image' => $this->absoluteMediaUrl($communityPost->image),
            ],
        ));
    }

    public function communityMarkdown(CommunityPost $communityPost): Response|RedirectResponse
    {
        abort_unless($communityPost->published_at?->lte(now()), 404);
        $canonical = url('/community/'.$communityPost->slug.'.md');

        if (url()->current() !== $canonical) {
            return redirect()->to($canonical, 301);
        }

        return $this->markdownResponse($this->contentMarkdownBody(
            $communityPost->seo_title ?: $communityPost->title,
            $communityPost->seo_description,
            url('/community/'.$communityPost->slug),
            $communityPost->published_at,
            $communityPost->updated_at,
            $communityPost->content,
            ['Type' => $communityPost->type],
        ));
    }

    private function providerItems(): Collection
    {
        return ProviderProfile::directory()
            ->with(['user:id,name,is_active', 'category:id,name', 'services' => fn ($query) => $query->where('is_active', true)->orderBy('price')->limit(8)])
            ->latest('updated_at')
            ->get();
    }

    private function newsItems(): Collection
    {
        return News::published()->latest('published_at')->get();
    }

    private function eventItems(): Collection
    {
        return Event::published()->latest('published_at')->get();
    }

    private function opportunityItems(): Collection
    {
        return Opportunity::published()->latest('published_at')->get();
    }

    private function communityItems(): Collection
    {
        return CommunityPost::published()->latest('published_at')->get();
    }

    private function providerMarkdownBody(ProviderProfile $provider): string
    {
        $name = $provider->user?->name ?? 'Beauty professional';
        $profession = $provider->profession ?: $provider->category?->name ?: 'Beauty professional';
        $location = $provider->city ?: $provider->location ?: $provider->country ?: 'Nigeria';
        $lines = [
            '# '.$this->plain("{$name} - {$profession} in {$location}"),
            '',
            'Canonical: '.url('/providers/'.$provider->slug),
            'Updated: '.optional($provider->updated_at)->toAtomString(),
            '',
            '## Summary',
            $this->plain($provider->bio ?: "Book {$name}, {$profession} in {$location}, on BeautyPro HQ."),
            '',
            '## Details',
            '- Profession: '.$this->plain($profession),
            '- Location: '.$this->plain($location),
            '- Rating: '.(((float) $provider->rating > 0) ? ((float) $provider->rating).' from '.(int) $provider->review_count.' reviews' : 'Not rated yet'),
            '',
            '## Services',
        ];

        foreach ($provider->services as $service) {
            $lines[] = '- '.$this->plain($service->name).' - '.$this->plain((string) ($service->currency ?: $provider->default_currency ?: 'NGN')).' '.number_format((float) $service->price, 2).' - '.(int) $service->duration_minutes.' minutes';
        }

        $lines[] = '';

        return implode("\n", $lines);
    }

    private function contentMarkdownBody(string $title, ?string $summary, string $canonical, mixed $publishedAt, mixed $updatedAt, string $content, array $metadata = []): string
    {
        $lines = [
            '# '.$this->plain($title),
            '',
            'Canonical: '.$canonical,
            'Published: '.optional($publishedAt)->toAtomString(),
            'Updated: '.optional($updatedAt)->toAtomString(),
        ];

        foreach ($metadata as $key => $value) {
            if (filled($value)) {
                $lines[] = $this->plain($key).': '.$this->plain((string) $value);
            }
        }

        if (filled($summary)) {
            $lines[] = '';
            $lines[] = '## Summary';
            $lines[] = $this->plain((string) $summary);
        }

        $lines[] = '';
        $lines[] = '## Content';
        $lines[] = $this->plain($content);
        $lines[] = '';

        return implode("\n", $lines);
    }

    private function contentMeta(string $title, string $description, string $canonical, ?string $image, string $type, array $structuredData): array
    {
        return [
            'pageTitle' => $this->plain($title),
            'pageDescription' => $this->summary($description, 300),
            'pageCanonical' => $canonical,
            'pageImage' => $this->absoluteMediaUrl($image),
            'pageType' => $type,
            'pageRobots' => 'index, follow',
            'structuredData' => array_filter($structuredData),
        ];
    }

    private function markdownResponse(string $markdown): Response
    {
        return response($markdown, 200)
            ->header('Content-Type', 'text/markdown; charset=UTF-8')
            ->header('Cache-Control', 'public, max-age=0, s-maxage=300, must-revalidate');
    }

    private function summary(?string $value, int $limit): string
    {
        return Str::limit($this->plain((string) $value), $limit, '');
    }

    private function plain(string $value): string
    {
        $withBreaks = preg_replace('#</(p|div|section|article|li|h[1-6]|blockquote|br)>#i', "\n", $value);

        return trim(preg_replace('/[ \t]+/', ' ', preg_replace('/\n{3,}/', "\n\n", html_entity_decode(strip_tags($withBreaks), ENT_QUOTES | ENT_HTML5, 'UTF-8'))));
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

    private function xml(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_COMPAT, 'UTF-8');
    }
}
