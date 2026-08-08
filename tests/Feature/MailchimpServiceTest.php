<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\NewsletterSubscriber;
use App\Services\MailchimpService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MailchimpServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_newsletter_subscriber_sync_sends_name_merge_fields(): void
    {
        Http::fake([
            'https://us21.api.mailchimp.com/3.0/*' => Http::response(['id' => 'ok'], 200),
        ]);

        $subscriber = NewsletterSubscriber::create([
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.test',
            'subscribed_at' => now(),
        ]);
        $this->configureMailchimp();

        $this->assertTrue(app(MailchimpService::class)->syncNewsletterSubscriber($subscriber));

        $hash = md5('ada@example.test');
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && $request->url() === "https://us21.api.mailchimp.com/3.0/lists/list-123/members/{$hash}"
            && $request['email_address'] === 'ada@example.test'
            && $request['merge_fields']['FNAME'] === 'Ada'
            && $request['merge_fields']['LNAME'] === 'Lovelace');
    }

    public function test_mailchimp_payload_exposes_name_merge_fields(): void
    {
        $payload = app(MailchimpService::class)->payload();

        $this->assertSame('FNAME', $payload['merge_fields']['first_name']);
        $this->assertSame('LNAME', $payload['merge_fields']['last_name']);
    }

    public function test_mailchimp_webhook_subscribe_stores_subscriber_name(): void
    {
        app(MailchimpService::class)->handleWebhook([
            'type' => 'subscribe',
            'data' => [
                'email' => 'subscriber@example.test',
                'merges' => [
                    'FNAME' => 'Beauty',
                    'LNAME' => 'Founder',
                ],
            ],
        ]);

        $this->assertDatabaseHas('newsletter_subscribers', [
            'name' => 'Beauty Founder',
            'email' => 'subscriber@example.test',
        ]);
    }

    private function configureMailchimp(): void
    {
        AppSetting::setValue('mailchimp.enabled', '1');
        AppSetting::setValue('mailchimp.api_key', 'test-key-us21', true);
        AppSetting::setValue('mailchimp.server_prefix', 'us21');
        AppSetting::setValue('mailchimp.list_id', 'list-123');
    }
}
