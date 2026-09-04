<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Services\GoogleWorkspaceMailService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class GoogleWorkspaceMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_connected_workspace_sends_raw_email_through_gmail_api(): void
    {
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google_workspace.email', 'hello@beautyprohq.com');
        AppSetting::setValue('google_workspace.access_token', 'access-token', true);
        AppSetting::setValue('google_workspace.refresh_token', 'refresh-token', true);
        AppSetting::setValue('google_workspace.access_token_expires_at', now()->addHour()->toIso8601String());
        Http::fake([
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' => Http::response(['id' => 'gmail-message-id']),
        ]);

        $id = app(GoogleWorkspaceMailService::class)->send("From: hello@beautyprohq.com\r\nTo: customer@example.com\r\nSubject: Test\r\n\r\nHello");

        $this->assertSame('gmail-message-id', $id);
        Http::assertSent(function (Request $request): bool {
            $raw = strtr((string) $request['raw'], '-_', '+/');
            $raw .= str_repeat('=', (4 - strlen($raw) % 4) % 4);

            return $request->hasHeader('Authorization', 'Bearer access-token')
                && str_contains((string) base64_decode($raw, true), 'Subject: Test');
        });
    }

    public function test_expired_access_token_is_refreshed_and_connection_persists(): void
    {
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google_workspace.email', 'hello@beautyprohq.com');
        AppSetting::setValue('google_workspace.access_token', 'expired-token', true);
        AppSetting::setValue('google_workspace.refresh_token', 'permanent-refresh-token', true);
        AppSetting::setValue('google_workspace.access_token_expires_at', now()->subMinute()->toIso8601String());
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response(['access_token' => 'refreshed-token', 'expires_in' => 3600]),
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' => Http::response(['id' => 'sent-after-refresh']),
        ]);

        $this->assertSame('sent-after-refresh', app(GoogleWorkspaceMailService::class)->send('Raw email'));
        $this->assertSame('permanent-refresh-token', AppSetting::getValue('google_workspace.refresh_token'));
        Http::assertSent(fn (Request $request): bool => $request->url() === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
                && $request->hasHeader('Authorization', 'Bearer refreshed-token'));
    }

    public function test_gmail_api_setup_errors_are_actionable(): void
    {
        AppSetting::setValue('google_workspace.email', 'hello@beautyprohq.com');
        AppSetting::setValue('google_workspace.access_token', 'access-token', true);
        AppSetting::setValue('google_workspace.refresh_token', 'refresh-token', true);
        AppSetting::setValue('google_workspace.access_token_expires_at', now()->addHour()->toIso8601String());
        Http::fake([
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' => Http::response([
                'error' => [
                    'message' => 'Gmail API has not been used in project 123 before or it is disabled.',
                    'errors' => [['reason' => 'accessNotConfigured']],
                ],
            ], 403),
        ]);

        $this->expectExceptionMessage('The Gmail API is not enabled for this Google Cloud project.');
        app(GoogleWorkspaceMailService::class)->send('Raw email');
    }

    public function test_laravel_notifications_can_use_google_workspace_transport(): void
    {
        AppSetting::setValue('google.client_id', 'client-id');
        AppSetting::setValue('google.client_secret', 'client-secret', true);
        AppSetting::setValue('google_workspace.email', 'hello@beautyprohq.com');
        AppSetting::setValue('google_workspace.access_token', 'access-token', true);
        AppSetting::setValue('google_workspace.refresh_token', 'refresh-token', true);
        AppSetting::setValue('google_workspace.access_token_expires_at', now()->addHour()->toIso8601String());
        config([
            'mail.default' => 'google_workspace',
            'mail.from.address' => 'hello@beautyprohq.com',
            'mail.mailers.google_workspace' => ['transport' => 'google_workspace'],
        ]);
        Mail::forgetMailers();
        Http::fake([
            'https://gmail.googleapis.com/gmail/v1/users/me/messages/send' => Http::response(['id' => 'laravel-gmail-id']),
        ]);

        Mail::raw('Workspace delivery test', function ($message): void {
            $message->to('customer@example.com')->subject('Laravel notification test');
        });

        Http::assertSent(function (Request $request): bool {
            $raw = strtr((string) $request['raw'], '-_', '+/');
            $raw .= str_repeat('=', (4 - strlen($raw) % 4) % 4);
            $mime = (string) base64_decode($raw, true);

            return str_contains($mime, 'Subject: Laravel notification test')
                && str_contains($mime, 'Workspace delivery test');
        });
    }
}
