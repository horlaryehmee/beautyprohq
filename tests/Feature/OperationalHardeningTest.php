<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\NewsletterSubscriber;
use App\Models\Payment;
use App\Models\SubscriptionPayment;
use App\Models\User;
use App\Support\SafeHtml;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class OperationalHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_api_responses_include_request_and_security_headers(): void
    {
        $response = $this->getJson('/api/status')->assertOk();

        $this->assertMatchesRegularExpression(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
            (string) $response->headers->get('X-Request-ID')
        );
        $this->assertSame('nosniff', $response->headers->get('X-Content-Type-Options'));
        $this->assertSame('SAMEORIGIN', $response->headers->get('X-Frame-Options'));
        $this->assertStringContainsString("default-src 'self'", (string) $response->headers->get('Content-Security-Policy'));
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_sanctum_stateful_domains_include_configured_app_host(): void
    {
        $_ENV['APP_URL'] = 'https://beautyprohq.example.test';
        $_SERVER['APP_URL'] = 'https://beautyprohq.example.test';
        $_ENV['FRONTEND_URL'] = 'https://frontend.example.test';
        $_SERVER['FRONTEND_URL'] = 'https://frontend.example.test';
        $_ENV['SANCTUM_STATEFUL_DOMAINS'] = 'legacy.example.test';
        $_SERVER['SANCTUM_STATEFUL_DOMAINS'] = 'legacy.example.test';

        $stateful = include base_path('config/sanctum.php');

        $this->assertContains('beautyprohq.example.test', $stateful['stateful']);
        $this->assertContains('frontend.example.test', $stateful['stateful']);
        $this->assertContains('legacy.example.test', $stateful['stateful']);
    }

    public function test_disabled_accounts_are_rejected_even_with_valid_authentication(): void
    {
        $user = User::factory()->create(['is_active' => false]);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me')
            ->assertForbidden()
            ->assertExactJson(['message' => 'This account has been disabled.']);
    }

    public function test_login_attempts_are_rate_limited_by_email_and_ip(): void
    {
        $this->withServerVariables(['REMOTE_ADDR' => '198.51.100.24']);
        $credentials = ['email' => 'limited@example.test', 'password' => 'WrongPassword123'];

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/auth/login', $credentials)->assertUnprocessable();
        }

        $response = $this->postJson('/api/auth/login', $credentials)->assertTooManyRequests();
        $this->assertNotNull($response->headers->get('Retry-After'));
        $this->assertNotNull($response->headers->get('X-Request-ID'));
    }

    public function test_gateway_responses_and_access_codes_are_not_serialized(): void
    {
        $payment = new Payment([
            'metadata' => [
                'payment_token' => 'customer-safe-token',
                'gateway_response' => ['authorization' => ['last4' => '4081']],
            ],
        ]);
        $paymentData = $payment->toArray();

        $this->assertSame('customer-safe-token', $paymentData['metadata']['payment_token']);
        $this->assertArrayNotHasKey('gateway_response', $paymentData['metadata']);

        $subscriptionPayment = new SubscriptionPayment([
            'reference' => 'BPHQ-TEST',
            'access_code' => 'secret-session-id',
            'raw_response' => ['customer' => ['email' => 'private@example.test']],
        ]);
        $subscriptionData = $subscriptionPayment->toArray();

        $this->assertArrayNotHasKey('access_code', $subscriptionData);
        $this->assertArrayNotHasKey('raw_response', $subscriptionData);
    }

    public function test_published_html_sanitizer_removes_nested_active_content(): void
    {
        $clean = SafeHtml::clean(
            '<p onclick="steal()">Welcome <span><script>alert(1)</script><strong>professional</strong></span> '
            .'<a href="javascript:alert(2)" style="color:red">bad</a> '
            .'<a href="https://example.com/profile">profile</a></p>'
        );

        $this->assertStringNotContainsString('script', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('javascript:', $clean);
        $this->assertStringNotContainsString('style=', $clean);
        $this->assertStringContainsString('<strong>professional</strong>', $clean);
        $this->assertStringContainsString('rel="nofollow noopener noreferrer"', $clean);
    }

    public function test_published_html_sanitizer_allows_editor_tools_safely(): void
    {
        $clean = SafeHtml::clean(
            '<p class="text-center bad-class" style="color:red">Centered</p>'
            .'<h2 style="text-align: right; background:url(javascript:alert(1))">Aligned heading</h2>'
            .'<img src="https://example.com/photo.webp" alt="Safe photo" onerror="alert(1)">'
            .'<img src="javascript:alert(1)" alt="Bad photo">'
            .'<table onclick="alert(1)"><thead><tr><th class="text-right">Plan</th></tr></thead><tbody><tr><td>Pro</td></tr></tbody></table>'
        );

        $this->assertStringContainsString('<p class="text-center">Centered</p>', $clean);
        $this->assertStringContainsString('<h2 style="text-align: right;">Aligned heading</h2>', $clean);
        $this->assertStringContainsString('<img src="https://example.com/photo.webp" alt="Safe photo">', $clean);
        $this->assertStringContainsString('<table>', $clean);
        $this->assertStringContainsString('<th class="text-right">Plan</th>', $clean);
        $this->assertStringNotContainsString('bad-class', $clean);
        $this->assertStringNotContainsString('color:red', $clean);
        $this->assertStringNotContainsString('background:', $clean);
        $this->assertStringNotContainsString('onerror', $clean);
        $this->assertStringNotContainsString('onclick', $clean);
        $this->assertStringNotContainsString('javascript:', $clean);
    }

    public function test_coming_soon_script_uses_an_exact_csp_hash(): void
    {
        AppSetting::setValue('features.coming_soon', '1');

        $response = $this->get('/')->assertOk();
        $csp = (string) $response->headers->get('Content-Security-Policy');
        preg_match('/script-src ([^;]+)/', $csp, $scriptDirective);

        $this->assertStringContainsString("'sha256-", $scriptDirective[1] ?? '');
        $this->assertStringNotContainsString("'unsafe-inline'", $scriptDirective[1] ?? '');
    }

    public function test_public_waitlist_submission_does_not_require_a_session_csrf_token(): void
    {
        $this->withHeader('Origin', rtrim(config('app.url'), '/'))
            ->postJson('/api/newsletter/subscribe', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_newsletter_subscription_stores_name_and_email(): void
    {
        $this->postJson('/api/newsletter/subscribe', [
            'name' => 'Beauty Founder',
            'email' => 'founder@example.test',
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Beauty Founder')
            ->assertJsonPath('data.email', 'founder@example.test');

        $this->assertDatabaseHas('newsletter_subscribers', [
            'name' => 'Beauty Founder',
            'email' => 'founder@example.test',
        ]);
    }

    public function test_signed_newsletter_unsubscribe_link_marks_subscriber_unsubscribed(): void
    {
        $subscriber = NewsletterSubscriber::create([
            'name' => 'Reader',
            'email' => 'reader@example.test',
            'subscribed_at' => now(),
        ]);

        $this->get("/newsletter/unsubscribe/{$subscriber->id}")->assertForbidden();
        $this->get(URL::signedRoute('newsletter.unsubscribe', ['subscriber' => $subscriber->id]))->assertOk();

        $this->assertNotNull($subscriber->fresh()->unsubscribed_at);
    }

    public function test_register_page_serves_spa_assets(): void
    {
        AppSetting::setValue('features.coming_soon', '0');

        $response = $this->get('/register')->assertOk();
        $html = (string) $response->getContent();

        $this->assertStringContainsString('<div id="root">', $html);
        $this->assertMatchesRegularExpression('#(/build/assets/app-[^"]+\.css|/resources/css/app\.css)#', $html);
        $this->assertMatchesRegularExpression('#(/build/assets/main-[^"]+\.js|/resources/js/main\.jsx)#', $html);
        $this->assertStringContainsString('type="module"', $html);
    }

    public function test_missing_compiled_assets_do_not_return_the_spa_shell(): void
    {
        $response = $this->get('/build/assets/missing-route-chunk.js')->assertNotFound();

        $this->assertStringNotContainsString('<div id="root">', (string) $response->getContent());
    }
}
