<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsureRecentAdminAuthentication;
use App\Models\AppSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminTwilioSettingsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_send_twilio_whatsapp_test_message(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        Http::fake([
            'api.twilio.com/*' => Http::response(['sid' => 'SM_TEST'], 201),
        ]);
        AppSetting::setValue('twilio.account_sid', 'AC123456789');
        AppSetting::setValue('twilio.auth_token', 'test-auth-token', true);
        AppSetting::setValue('twilio.whatsapp_from', 'whatsapp:+14155238886');

        $admin = User::factory()->admin()->create();
        Sanctum::actingAs($admin);

        $this->postJson('/api/admin/settings/twilio/test', [
            'phone' => '+2348012345678',
            'message' => 'Custom WhatsApp test text',
        ])->assertOk()
            ->assertJsonPath('data.phone', '+2348012345678')
            ->assertJsonPath('data.message', 'Custom WhatsApp test text');

        Http::assertSent(fn ($request) => $request->url() === 'https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json'
            && $request['From'] === 'whatsapp:+14155238886'
            && $request['To'] === 'whatsapp:+2348012345678'
            && $request['Body'] === 'Custom WhatsApp test text');
    }
}
