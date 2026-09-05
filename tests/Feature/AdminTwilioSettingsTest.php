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
        ])->assertOk()
            ->assertJsonPath('data.phone', '+2348012345678')
            ->assertJsonPath('data.message', fn ($message) => str_contains($message, 'New booking on BeautyPro HQ')
                && str_contains($message, 'Service: Bridal makeup consultation')
                && str_contains($message, 'This is an automated booking notification. No reply is required.'));

        Http::assertSent(fn ($request) => $request->url() === 'https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json'
            && $request['From'] === 'whatsapp:+14155238886'
            && $request['To'] === 'whatsapp:+2348012345678'
            && str_contains($request['Body'], 'New booking on BeautyPro HQ')
            && str_contains($request['Body'], 'This is an automated booking notification. No reply is required.'));
    }

    public function test_admin_can_save_encrypted_twilio_auth_token(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        Http::fake([
            'api.twilio.com/*' => Http::response(['sid' => 'SM_AUTH_TOKEN_TEST'], 201),
        ]);

        Sanctum::actingAs(User::factory()->admin()->create());
        $this->putJson('/api/admin/settings/twilio', [
            'account_sid' => 'AC123456789',
            'auth_token' => 'saved-auth-token',
            'whatsapp_from' => 'whatsapp:+14155238886',
        ])->assertOk()
            ->assertJsonPath('data.account_sid', 'AC123456789')
            ->assertJsonPath('data.auth_token_configured', true)
            ->assertJsonPath('data.configured', true)
            ->assertJsonMissingPath('data.auth_token');

        $this->assertTrue((bool) AppSetting::where('key', 'twilio.auth_token')->value('encrypted'));
        $this->assertNotSame('saved-auth-token', AppSetting::where('key', 'twilio.auth_token')->value('value'));

        $this->postJson('/api/admin/settings/twilio/test', [
            'phone' => '+2348012345678',
        ])->assertOk();

        Http::assertSent(fn ($request) => $request->url() === 'https://api.twilio.com/2010-04-01/Accounts/AC123456789/Messages.json'
            && $request->hasHeader('Authorization', 'Basic '.base64_encode('AC123456789:saved-auth-token'))
            && str_contains($request['Body'], 'New booking on BeautyPro HQ'));
    }

    public function test_trial_content_template_is_sent_instead_of_custom_body(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        Http::fake([
            'api.twilio.com/*' => Http::response(['sid' => 'SM_TEMPLATE_TEST'], 201),
        ]);
        AppSetting::setValue('twilio.account_sid', 'AC123456789');
        AppSetting::setValue('twilio.auth_token', 'test-auth-token', true);
        AppSetting::setValue('twilio.whatsapp_from', 'whatsapp:+17372508034');
        AppSetting::setValue('twilio.content_sid', 'HXb5b62575e6e4ff6129ad7c8efe1f983e');
        AppSetting::setValue('twilio.content_variables', '{"1":"5 September 2026","2":"3:00pm"}');

        Sanctum::actingAs(User::factory()->admin()->create());

        $this->postJson('/api/admin/settings/twilio/test', [
            'phone' => '+2348012345678',
        ])->assertOk();

        Http::assertSent(fn ($request) => $request['From'] === 'whatsapp:+17372508034'
            && $request['To'] === 'whatsapp:+2348012345678'
            && $request['ContentSid'] === 'HXb5b62575e6e4ff6129ad7c8efe1f983e'
            && $request['ContentVariables'] === '{"1":"5 September 2026","2":"3:00pm"}'
            && ! isset($request['Body']));
    }

    public function test_twilio_error_message_is_returned_without_credentials(): void
    {
        $this->withoutMiddleware(EnsureRecentAdminAuthentication::class);
        Http::fake([
            'api.twilio.com/*' => Http::response([
                'code' => 572002,
                'message' => 'A ContentSid is required in the trial environment.',
            ], 422),
        ]);
        AppSetting::setValue('twilio.account_sid', 'AC123456789');
        AppSetting::setValue('twilio.auth_token', 'secret-token', true);
        AppSetting::setValue('twilio.whatsapp_from', 'whatsapp:+17372508034');

        Sanctum::actingAs(User::factory()->admin()->create());

        $this->postJson('/api/admin/settings/twilio/test', [
            'phone' => '+2348012345678',
        ])->assertStatus(422)
            ->assertJsonPath('message', 'Twilio error 572002: A ContentSid is required in the trial environment.')
            ->assertJsonMissing(['secret-token']);
    }
}
