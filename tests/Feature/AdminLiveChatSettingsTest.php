<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureRecentAdminAuthentication;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminLiveChatSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_read_live_chat_settings(): void
    {
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->getJson('/api/admin/settings/live-chat')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'inbound_secret_configured',
                    'inbound_secret_last4',
                    'reply_domain',
                    'webhook_url',
                    'configured',
                    'source',
                ],
            ]);
    }

    public function test_admin_can_save_live_chat_secret_and_domain(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/live-chat', [
            'inbound_secret' => 'super-secret-value',
            'reply_domain' => 'chat.example.com',
        ])->assertOk()
            ->assertJsonPath('data.inbound_secret_configured', true)
            ->assertJsonPath('data.reply_domain', 'chat.example.com')
            ->assertJsonPath('data.configured', true);

        $this->assertNotNull(AppSetting::getValue('live_chat.inbound_secret'));
        $this->assertSame('chat.example.com', AppSetting::getValue('live_chat.reply_domain'));
    }

    public function test_inbound_secret_is_not_echoed_back(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->putJson('/api/admin/settings/live-chat', [
            'inbound_secret' => 'secret-should-not-leak',
            'reply_domain' => 'chat.example.com',
        ])->assertOk()
            ->assertJsonMissing(['inbound_secret' => 'secret-should-not-leak'])
            ->assertJsonPath('data.inbound_secret_last4', 'leak');
    }
}
