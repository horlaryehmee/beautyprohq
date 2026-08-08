<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\ContactEnquiry;
use App\Models\EventRegistration;
use App\Models\NewsletterSubscriber;
use App\Models\OpportunityEnquiry;
use App\Models\User;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MailchimpService
{
    public function configured(): bool
    {
        return AppSetting::getValue('mailchimp.enabled', '0') === '1'
            && filled($this->apiKey())
            && filled($this->listId())
            && filled($this->serverPrefix());
    }

    public function payload(): array
    {
        $apiKey = $this->apiKey();

        return [
            'enabled' => AppSetting::getValue('mailchimp.enabled', '0') === '1',
            'api_key_configured' => filled($apiKey),
            'api_key_last4' => filled($apiKey) ? substr((string) $apiKey, -4) : null,
            'server_prefix' => $this->serverPrefix(),
            'list_id' => $this->listId(),
            'webhook_secret_configured' => filled(AppSetting::getValue('mailchimp.webhook_secret')),
            'configured' => $this->configured(),
            'tags' => [
                'base' => 'BeautyPro HQ',
                'subscriber' => 'Newsletter Subscriber',
                'provider' => 'Role: Provider',
                'customer' => 'Role: Customer',
                'admin' => 'Role: Admin',
                'event_attendee' => 'Event Attendee',
                'opportunity_enquiry' => 'Opportunity Enquiry',
                'contact_enquiry' => 'Contact Enquiry',
            ],
        ];
    }

    public function testConnection(): array
    {
        $this->ensureConfigured();
        $response = $this->request('get', '/lists/'.$this->listId());

        return [
            'id' => $response->json('id'),
            'name' => $response->json('name'),
            'stats' => $response->json('stats'),
        ];
    }

    public function syncUser(User $user): bool
    {
        if (! $this->configured() || blank($user->email)) {
            return false;
        }

        try {
            $hash = $this->subscriberHash($user->email);
            $name = $this->splitName($user->name);

            $this->request('put', "/lists/{$this->listId()}/members/{$hash}", [
                'email_address' => Str::lower(trim($user->email)),
                'status_if_new' => 'subscribed',
                'merge_fields' => array_filter([
                    'FNAME' => $name['first'],
                    'LNAME' => $name['last'],
                ]),
            ]);

            $this->syncTags($hash, [
                'BeautyPro HQ',
                'Source: Platform User',
                'Role: '.Str::title($user->role ?: 'User'),
                $user->is_active ? 'Status: Active' : 'Status: Inactive',
            ]);

            return true;
        } catch (\Throwable $exception) {
            Log::warning('Mailchimp user sync failed.', [
                'user_id' => $user->id,
                'email_hash' => hash('sha256', strtolower((string) $user->email)),
                'message' => $exception->getMessage(),
            ]);

            return false;
        }
    }

    public function syncNewsletterSubscriber(NewsletterSubscriber $subscriber): bool
    {
        if (! $this->configured() || blank($subscriber->email)) {
            return false;
        }

        try {
            $hash = $this->subscriberHash($subscriber->email);
            $status = $subscriber->unsubscribed_at ? 'unsubscribed' : 'subscribed';
            $nameParts = $this->splitName($subscriber->name);

            $this->request('put', "/lists/{$this->listId()}/members/{$hash}", [
                'email_address' => Str::lower(trim($subscriber->email)),
                'status_if_new' => $status,
                'status' => $status,
                'merge_fields' => array_filter([
                    'FNAME' => $nameParts['first'],
                    'LNAME' => $nameParts['last'],
                ]),
            ]);

            $this->syncTags($hash, [
                'BeautyPro HQ',
                'Newsletter Subscriber',
                'Source: Website Newsletter',
                $subscriber->unsubscribed_at ? 'Status: Unsubscribed' : 'Status: Active',
            ]);

            return true;
        } catch (\Throwable $exception) {
            Log::warning('Mailchimp newsletter subscriber sync failed.', [
                'subscriber_id' => $subscriber->id,
                'email_hash' => hash('sha256', strtolower((string) $subscriber->email)),
                'message' => $exception->getMessage(),
            ]);

            return false;
        }
    }

    public function syncContact(string $email, ?string $name, array $tags): bool
    {
        if (! $this->configured() || blank($email)) {
            return false;
        }

        try {
            $hash = $this->subscriberHash($email);
            $nameParts = $this->splitName($name);

            $this->request('put', "/lists/{$this->listId()}/members/{$hash}", [
                'email_address' => Str::lower(trim($email)),
                'status_if_new' => 'subscribed',
                'merge_fields' => array_filter([
                    'FNAME' => $nameParts['first'],
                    'LNAME' => $nameParts['last'],
                ]),
            ]);

            $this->syncTags($hash, [
                'BeautyPro HQ',
                'Source: Platform Lead',
                ...$tags,
            ]);

            return true;
        } catch (\Throwable $exception) {
            Log::warning('Mailchimp contact sync failed.', [
                'email_hash' => hash('sha256', strtolower($email)),
                'tags' => $tags,
                'message' => $exception->getMessage(),
            ]);

            return false;
        }
    }

    public function syncAll(): array
    {
        $this->ensureConfigured();
        $synced = 0;
        $failed = 0;

        User::query()->whereNotNull('email')->orderBy('id')->chunkById(100, function ($users) use (&$synced, &$failed): void {
            foreach ($users as $user) {
                $this->syncUser($user) ? $synced++ : $failed++;
            }
        });

        NewsletterSubscriber::query()->whereNotNull('email')->orderBy('id')->chunkById(100, function ($subscribers) use (&$synced, &$failed): void {
            foreach ($subscribers as $subscriber) {
                $this->syncNewsletterSubscriber($subscriber) ? $synced++ : $failed++;
            }
        });

        EventRegistration::query()->with('event:id,title')->whereNotNull('email')->orderBy('id')->chunkById(100, function ($registrations) use (&$synced, &$failed): void {
            foreach ($registrations as $registration) {
                $tags = ['Event Attendee'];
                if ($registration->event?->title) {
                    $tags[] = 'Event: '.$registration->event->title;
                }
                $this->syncContact($registration->email, $registration->name, $tags) ? $synced++ : $failed++;
            }
        });

        OpportunityEnquiry::query()->with('opportunity:id,title')->whereNotNull('email')->orderBy('id')->chunkById(100, function ($enquiries) use (&$synced, &$failed): void {
            foreach ($enquiries as $enquiry) {
                $tags = ['Opportunity Enquiry'];
                if ($enquiry->opportunity?->title) {
                    $tags[] = 'Opportunity: '.$enquiry->opportunity->title;
                }
                $this->syncContact($enquiry->email, $enquiry->name, $tags) ? $synced++ : $failed++;
            }
        });

        ContactEnquiry::query()->whereNotNull('email')->orderBy('id')->chunkById(100, function ($enquiries) use (&$synced, &$failed): void {
            foreach ($enquiries as $enquiry) {
                $tags = ['Contact Enquiry'];
                if ($enquiry->reason) {
                    $tags[] = 'Contact Reason: '.$enquiry->reason;
                }
                $this->syncContact($enquiry->email, $enquiry->name, $tags) ? $synced++ : $failed++;
            }
        });

        return compact('synced', 'failed');
    }

    public function handleWebhook(array $payload): void
    {
        $type = $payload['type'] ?? null;
        $data = $payload['data'] ?? [];
        $email = Str::lower(trim($data['email'] ?? $data['merges']['EMAIL'] ?? ''));

        if (blank($email)) {
            return;
        }

        if ($type === 'unsubscribe') {
            NewsletterSubscriber::where('email', $email)->update(['unsubscribed_at' => now()]);
            return;
        }

        if ($type === 'subscribe') {
            $name = trim(($data['merges']['FNAME'] ?? '').' '.($data['merges']['LNAME'] ?? '')) ?: null;
            NewsletterSubscriber::updateOrCreate(
                ['email' => $email],
                ['name' => $name, 'subscribed_at' => now(), 'unsubscribed_at' => null]
            );
        }
    }

    public function verifyWebhookSignature(?string $header, string $rawBody, int $toleranceSeconds = 300): bool
    {
        $secret = AppSetting::getValue('mailchimp.webhook_secret');

        if (blank($secret)) {
            return false;
        }

        if (! preg_match('/\bt=(\d+)\b/', (string) $header, $timestampMatch)
            || ! preg_match('/\bv1=([0-9a-f]{64})\b/', (string) $header, $signatureMatch)) {
            return false;
        }

        $timestamp = (int) $timestampMatch[1];
        if (abs(time() - $timestamp) > $toleranceSeconds) {
            return false;
        }

        $expected = hash_hmac('sha256', $timestamp.'.'.$rawBody, $secret);

        return hash_equals($expected, $signatureMatch[1]);
    }

    private function syncTags(string $hash, array $activeTags): void
    {
        $this->request('post', "/lists/{$this->listId()}/members/{$hash}/tags", [
            'tags' => collect($activeTags)
                ->filter()
                ->unique()
                ->map(fn (string $tag) => ['name' => Str::limit($tag, 100, ''), 'status' => 'active'])
                ->values()
                ->all(),
        ]);
    }

    private function request(string $method, string $path, array $payload = []): Response
    {
        $response = Http::external()->withBasicAuth('beautyprohq', $this->apiKey())
            ->acceptJson()
            ->asJson()
            ->{$method}("https://{$this->serverPrefix()}.api.mailchimp.com/3.0{$path}", $payload);

        if ($response->failed()) {
            throw new \RuntimeException($response->json('detail') ?: $response->body());
        }

        return $response;
    }

    private function ensureConfigured(): void
    {
        abort_unless($this->configured(), 422, 'Mailchimp is not fully connected.');
    }

    private function subscriberHash(string $email): string
    {
        return md5(Str::lower(trim($email)));
    }

    private function splitName(?string $name): array
    {
        $parts = preg_split('/\s+/', trim((string) $name), 2) ?: [];

        return [
            'first' => $parts[0] ?? '',
            'last' => $parts[1] ?? '',
        ];
    }

    private function apiKey(): ?string
    {
        return AppSetting::getValue('mailchimp.api_key');
    }

    private function listId(): ?string
    {
        return AppSetting::getValue('mailchimp.list_id');
    }

    private function serverPrefix(): ?string
    {
        $saved = AppSetting::getValue('mailchimp.server_prefix');
        if (filled($saved)) {
            return $saved;
        }

        $apiKey = $this->apiKey();
        if (filled($apiKey) && str_contains($apiKey, '-')) {
            return Str::afterLast($apiKey, '-');
        }

        return null;
    }
}
