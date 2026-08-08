<?php

namespace App\Services;

use App\Models\CommunityPost;
use App\Models\Event;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Opportunity;
use App\Notifications\ContentPublishedNewsletterNotification;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\Notification;

class ContentNewsletterService
{
    public function requestOrSend(Model $content, string $type, bool $requested): array
    {
        if (! $requested) {
            return ['requested' => false, 'sent' => false, 'count' => 0];
        }

        if ($content->newsletter_notified_at) {
            return ['requested' => true, 'sent' => false, 'count' => (int) $content->newsletter_notified_count];
        }

        $content->forceFill(['newsletter_notify_requested_at' => now()])->save();

        if (! $this->isPublishDue($content)) {
            return ['requested' => true, 'sent' => false, 'count' => 0];
        }

        return $this->send($content->fresh(), $type);
    }

    public function sendDue(): array
    {
        $sent = 0;
        $content = 0;

        foreach ($this->dueContent() as [$item, $type]) {
            $result = $this->send($item, $type);
            if ($result['sent']) {
                $content++;
                $sent += $result['count'];
            }
        }

        return compact('content', 'sent');
    }

    public function send(Model $content, string $type): array
    {
        if ($content->newsletter_notified_at || ! $this->isPublishDue($content)) {
            return ['requested' => true, 'sent' => false, 'count' => (int) ($content->newsletter_notified_count ?? 0)];
        }

        $count = 0;
        $title = (string) $content->title;
        $summary = $this->summary($content, $type);
        $url = $this->url($content, $type);
        $label = $type === 'community' ? 'community story' : $type;

        NewsletterSubscriber::query()
            ->whereNotNull('email')
            ->whereNull('unsubscribed_at')
            ->orderBy('id')
            ->chunkById(100, function ($subscribers) use (&$count, $label, $title, $summary, $url): void {
                foreach ($subscribers as $subscriber) {
                    Notification::route('mail', $subscriber->email)->notify(
                        new ContentPublishedNewsletterNotification(
                            (int) $subscriber->id,
                            (string) ($subscriber->name ?? ''),
                            $label,
                            $title,
                            $summary,
                            $url,
                        )
                    );
                    $count++;
                }
            });

        $content->forceFill([
            'newsletter_notified_at' => now(),
            'newsletter_notified_count' => $count,
        ])->save();

        return ['requested' => true, 'sent' => true, 'count' => $count];
    }

    private function dueContent(): array
    {
        $items = [];
        News::query()->whereNotNull('newsletter_notify_requested_at')->whereNull('newsletter_notified_at')->published()
            ->get()->each(function (News $news) use (&$items): void {
                $items[] = [$news, 'news'];
            });
        Event::query()->whereNotNull('newsletter_notify_requested_at')->whereNull('newsletter_notified_at')->published()
            ->get()->each(function (Event $event) use (&$items): void {
                $items[] = [$event, 'event'];
            });
        CommunityPost::query()->whereNotNull('newsletter_notify_requested_at')->whereNull('newsletter_notified_at')->published()
            ->get()->each(function (CommunityPost $post) use (&$items): void {
                $items[] = [$post, 'community'];
            });
        Opportunity::query()->whereNotNull('newsletter_notify_requested_at')->whereNull('newsletter_notified_at')->published()
            ->get()->each(function (Opportunity $opportunity) use (&$items): void {
                $items[] = [$opportunity, 'opportunity'];
            });

        return $items;
    }

    private function isPublishDue(Model $content): bool
    {
        return $content->published_at && $content->published_at->lte(now());
    }

    private function summary(Model $content, string $type): string
    {
        $source = match ($type) {
            'event' => $content->description,
            'opportunity' => $content->description,
            default => $content->excerpt ?? $content->content,
        };

        return Str::limit(trim(preg_replace('/\s+/', ' ', html_entity_decode(strip_tags((string) $source), ENT_QUOTES | ENT_HTML5, 'UTF-8'))), 220);
    }

    private function url(Model $content, string $type): string
    {
        $base = rtrim(config('app.frontend_url', config('app.url')), '/');

        return match ($type) {
            'news' => $base.'/news-events/news/'.$content->slug,
            'event' => $base.'/news-events/events/'.$content->slug,
            'community' => $base.'/community/'.$content->id,
            'opportunity' => $base.'/opportunities/'.$content->id,
            default => $base,
        };
    }
}
