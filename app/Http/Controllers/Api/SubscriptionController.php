<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\SmtpConnectionTestMail;
use App\Models\ContactEnquiry;
use App\Models\AppSetting;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\Opportunity;
use App\Models\OpportunityEnquiry;
use App\Models\User;
use App\Notifications\BeautyProResetPasswordNotification;
use App\Notifications\BeautyProVerifyEmailNotification;
use App\Notifications\ContactEnquiryConfirmation;
use App\Notifications\EventRegistrationConfirmation;
use App\Notifications\NewsletterSubscriptionConfirmation;
use App\Notifications\OpportunityEnquiryConfirmation;
use App\Notifications\PlatformUpdateNotification;
use App\Notifications\TwoFactorCodeNotification;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use App\Support\HomepageShell;
use App\Services\MailchimpService;
use App\Services\TwilioWhatsAppService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SubscriptionController extends Controller
{
    public function plans(): JsonResponse
    {
        return $this->success(SubscriptionPlan::where('is_active', true)->orderBy('sort_order')->get());
    }

    public function adminPlans(): JsonResponse
    {
        return $this->success(SubscriptionPlan::orderBy('sort_order')->get());
    }

    public function updateAdminPlan(Request $request, SubscriptionPlan $plan): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'price' => ['sometimes', 'numeric', 'min:0', 'max:999999999'],
            'currency' => ['sometimes', Rule::in(array_keys(config('currencies.supported', [])))],
            'billing_period' => ['sometimes', Rule::in(['monthly', 'yearly'])],
            'features' => ['sometimes', 'array'],
            'features.*' => ['string', 'max:180'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($plan->key === 'free') {
            $validated['price'] = 0;
        }

        $plan->update($validated);

        return $this->success($plan->fresh(), 'Plan updated.');
    }

    public function current(Request $request): JsonResponse
    {
        $payments = $request->user()
            ->subscriptionPayments()
            ->with('plan')
            ->latest()
            ->paginate($this->perPage($request, 10, 50, 'payments_per_page'), ['*'], 'payments_page', max(1, $request->integer('payments_page', 1)));

        return $this->success([
            'subscription' => $request->user()->activeSubscription()->with('planDefinition')->first(),
            'plans' => SubscriptionPlan::where('is_active', true)->orderBy('sort_order')->get(),
            'payments' => [
                'data' => $payments->items(),
                'meta' => $this->paginationMeta($payments),
            ],
            'paystack_configured' => $this->paystackConfigured(),
            'stripe_configured' => $this->stripeConfigured(),
            'subscription_gateway' => $this->subscriptionGateway(),
        ]);
    }

    public function adminPaystackSettings(): JsonResponse
    {
        $mode = $this->paystackMode();
        $testSecret = AppSetting::getValue('paystack.test_secret_key') ?: config('services.paystack.secret_key');
        $liveSecret = AppSetting::getValue('paystack.live_secret_key');

        return $this->success([
            'mode' => $mode,
            'test_public_key' => AppSetting::getValue('paystack.test_public_key') ?: config('services.paystack.public_key'),
            'live_public_key' => AppSetting::getValue('paystack.live_public_key'),
            'test_secret_configured' => filled($testSecret),
            'live_secret_configured' => filled($liveSecret),
            'test_secret_last4' => filled($testSecret) ? substr($testSecret, -4) : null,
            'live_secret_last4' => filled($liveSecret) ? substr($liveSecret, -4) : null,
            'active_secret_configured' => filled($this->paystackSecretKey()),
            'source' => [
                'test_public_key' => filled(AppSetting::getValue('paystack.test_public_key')) ? 'admin_settings' : (filled(config('services.paystack.public_key')) ? 'env' : null),
                'test_secret_key' => filled(AppSetting::getValue('paystack.test_secret_key')) ? 'admin_settings' : (filled(config('services.paystack.secret_key')) ? 'env' : null),
                'live_public_key' => filled(AppSetting::getValue('paystack.live_public_key')) ? 'admin_settings' : null,
                'live_secret_key' => filled(AppSetting::getValue('paystack.live_secret_key')) ? 'admin_settings' : null,
            ],
            'callback_url' => url('/provider/subscription'),
        ]);
    }

    public function updateAdminPaystackSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['required', Rule::in(['test', 'live'])],
            'test_public_key' => ['nullable', 'string', 'max:255'],
            'test_secret_key' => ['nullable', 'string', 'max:255'],
            'live_public_key' => ['nullable', 'string', 'max:255'],
            'live_secret_key' => ['nullable', 'string', 'max:255'],
        ]);

        AppSetting::setValue('paystack.mode', $validated['mode']);
        AppSetting::setValue('paystack.test_public_key', $validated['test_public_key'] ?? null);
        AppSetting::setValue('paystack.live_public_key', $validated['live_public_key'] ?? null);
        if (filled($validated['test_secret_key'] ?? null)) {
            AppSetting::setValue('paystack.test_secret_key', $validated['test_secret_key'], true);
        }
        if (filled($validated['live_secret_key'] ?? null)) {
            AppSetting::setValue('paystack.live_secret_key', $validated['live_secret_key'], true);
        }

        return $this->adminPaystackSettings();
    }

    public function adminStripeSettings(): JsonResponse
    {
        $mode = $this->stripeMode();
        $testSecret = AppSetting::getValue('stripe.test_secret_key');
        $liveSecret = AppSetting::getValue('stripe.live_secret_key');

        return $this->success([
            'mode' => $mode,
            'test_publishable_key' => AppSetting::getValue('stripe.test_publishable_key'),
            'live_publishable_key' => AppSetting::getValue('stripe.live_publishable_key'),
            'test_secret_configured' => filled($testSecret),
            'live_secret_configured' => filled($liveSecret),
            'test_secret_last4' => filled($testSecret) ? substr($testSecret, -4) : null,
            'live_secret_last4' => filled($liveSecret) ? substr($liveSecret, -4) : null,
            'active_secret_configured' => filled($this->stripeSecretKey()),
            'success_url' => url('/provider/subscription'),
        ]);
    }

    public function updateAdminStripeSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['required', Rule::in(['test', 'live'])],
            'test_publishable_key' => ['nullable', 'string', 'max:255'],
            'test_secret_key' => ['nullable', 'string', 'max:255'],
            'live_publishable_key' => ['nullable', 'string', 'max:255'],
            'live_secret_key' => ['nullable', 'string', 'max:255'],
        ]);

        AppSetting::setValue('stripe.mode', $validated['mode']);
        AppSetting::setValue('stripe.test_publishable_key', $validated['test_publishable_key'] ?? null);
        AppSetting::setValue('stripe.live_publishable_key', $validated['live_publishable_key'] ?? null);
        if (filled($validated['test_secret_key'] ?? null)) {
            AppSetting::setValue('stripe.test_secret_key', $validated['test_secret_key'], true);
        }
        if (filled($validated['live_secret_key'] ?? null)) {
            AppSetting::setValue('stripe.live_secret_key', $validated['live_secret_key'], true);
        }

        return $this->adminStripeSettings();
    }

    public function adminPaymentGatewaySettings(): JsonResponse
    {
        return $this->success([
            'subscription_gateway' => $this->subscriptionGateway(),
            'paystack_configured' => $this->paystackConfigured(),
            'stripe_configured' => $this->stripeConfigured(),
        ]);
    }

    public function updateAdminPaymentGatewaySettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'subscription_gateway' => ['required', Rule::in(['paystack', 'stripe'])],
        ]);

        AppSetting::setValue('payments.subscription_gateway', $validated['subscription_gateway']);

        return $this->adminPaymentGatewaySettings();
    }

    public function adminCurrencySettings(): JsonResponse
    {
        return $this->success($this->currencyPayload());
    }

    public function adminBrandingSettings(): JsonResponse
    {
        return $this->success($this->brandingPayload());
    }

    public function adminFeatureSettings(): JsonResponse
    {
        return $this->success($this->featurePayload());
    }

    public function adminTwilioSettings(): JsonResponse
    {
        $authToken = AppSetting::getValue('twilio.auth_token') ?: config('services.twilio.auth_token');

        return $this->success([
            'account_sid' => AppSetting::getValue('twilio.account_sid') ?: config('services.twilio.account_sid'),
            'whatsapp_from' => AppSetting::getValue('twilio.whatsapp_from') ?: config('services.twilio.whatsapp_from'),
            'auth_token_configured' => filled($authToken),
            'auth_token_last4' => filled($authToken) ? substr($authToken, -4) : null,
            'configured' => filled(AppSetting::getValue('twilio.account_sid') ?: config('services.twilio.account_sid'))
                && filled($authToken)
                && filled(AppSetting::getValue('twilio.whatsapp_from') ?: config('services.twilio.whatsapp_from')),
            'source' => [
                'account_sid' => filled(AppSetting::getValue('twilio.account_sid')) ? 'admin_settings' : (filled(config('services.twilio.account_sid')) ? 'env' : null),
                'auth_token' => filled(AppSetting::getValue('twilio.auth_token')) ? 'admin_settings' : (filled(config('services.twilio.auth_token')) ? 'env' : null),
                'whatsapp_from' => filled(AppSetting::getValue('twilio.whatsapp_from')) ? 'admin_settings' : (filled(config('services.twilio.whatsapp_from')) ? 'env' : null),
            ],
        ]);
    }

    public function updateAdminTwilioSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'account_sid' => ['nullable', 'string', 'max:255'],
            'auth_token' => ['nullable', 'string', 'max:255'],
            'whatsapp_from' => ['nullable', 'string', 'max:40'],
        ]);

        AppSetting::setValue('twilio.account_sid', $validated['account_sid'] ?? null);
        AppSetting::setValue('twilio.whatsapp_from', $validated['whatsapp_from'] ?? null);
        if (filled($validated['auth_token'] ?? null)) {
            AppSetting::setValue('twilio.auth_token', $validated['auth_token'], true);
        }

        return $this->adminTwilioSettings();
    }

    public function testAdminTwilio(Request $request, TwilioWhatsAppService $twilio): JsonResponse
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:40'],
            'message' => ['required', 'string', 'min:2', 'max:1500'],
        ]);

        abort_unless($twilio->configured(), 422, 'Twilio WhatsApp is not configured.');

        $sent = $twilio->send(
            $validated['phone'],
            $validated['message']
        );

        abort_unless($sent, 422, 'Twilio WhatsApp test failed. Check the recipient number, sandbox opt-in, sender number and Twilio logs.');

        return $this->success([
            'phone' => $validated['phone'],
            'message' => $validated['message'],
        ], 'WhatsApp test message sent.');
    }

    public function adminSmtpSettings(): JsonResponse
    {
        $password = AppSetting::getValue('smtp.password');
        $configuredEncryption = config('mail.mailers.smtp.scheme') === 'smtps'
            ? 'ssl'
            : ((bool) config('mail.mailers.smtp.require_tls') ? 'tls' : null);

        return $this->success([
            'enabled' => AppSetting::getValue('smtp.enabled', '0') === '1',
            'host' => AppSetting::getValue('smtp.host') ?: config('mail.mailers.smtp.host'),
            'port' => AppSetting::getValue('smtp.port') ?: config('mail.mailers.smtp.port', 587),
            'username' => AppSetting::getValue('smtp.username') ?: config('mail.mailers.smtp.username'),
            'encryption' => AppSetting::getValue('smtp.encryption') ?: $configuredEncryption,
            'from_address' => AppSetting::getValue('smtp.from_address') ?: config('mail.from.address'),
            'from_name' => AppSetting::getValue('smtp.from_name') ?: config('mail.from.name', config('app.name')),
            'password_configured' => filled($password ?: config('mail.mailers.smtp.password')),
            'password_last4' => filled($password ?: config('mail.mailers.smtp.password')) ? substr((string) ($password ?: config('mail.mailers.smtp.password')), -4) : null,
            'configured' => AppSetting::getValue('smtp.enabled', '0') === '1'
                && filled(AppSetting::getValue('smtp.host') ?: config('mail.mailers.smtp.host'))
                && filled(AppSetting::getValue('smtp.port') ?: config('mail.mailers.smtp.port'))
                && filled(AppSetting::getValue('smtp.from_address') ?: config('mail.from.address')),
        ]);
    }

    public function updateAdminSmtpSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'host' => ['nullable', 'string', 'max:255'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:500'],
            'encryption' => ['nullable', Rule::in(['', 'tls', 'ssl'])],
            'from_address' => ['nullable', 'email:rfc', 'max:255'],
            'from_name' => ['nullable', 'string', 'max:255'],
        ]);

        AppSetting::setValue('smtp.enabled', $validated['enabled'] ? '1' : '0');
        AppSetting::setValue('smtp.host', $validated['host'] ?? null);
        AppSetting::setValue('smtp.port', $validated['port'] ?? null);
        AppSetting::setValue('smtp.username', $validated['username'] ?? null);
        AppSetting::setValue('smtp.encryption', $validated['encryption'] ?? null);
        AppSetting::setValue('smtp.from_address', $validated['from_address'] ?? null);
        AppSetting::setValue('smtp.from_name', $validated['from_name'] ?? null);
        if (filled($validated['password'] ?? null)) {
            AppSetting::setValue('smtp.password', $validated['password'], true);
        }

        app('mail.manager')->forgetMailers();

        return $this->adminSmtpSettings();
    }

    public function testAdminSmtp(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
        ]);

        $this->assertSmtpConfigured();

        app('mail.manager')->forgetMailers();

        try {
            Mail::to($validated['email'])->send(new SmtpConnectionTestMail($request->user()->email));
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'SMTP test failed. Check the saved settings and server logs.',
            ], 422);
        }

        return $this->success([
            'email' => $validated['email'],
        ], 'Test email sent.');
    }

    public function adminMailchimpSettings(MailchimpService $mailchimp): JsonResponse
    {
        return $this->success($mailchimp->payload());
    }

    public function updateAdminMailchimpSettings(Request $request, MailchimpService $mailchimp): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'api_key' => ['nullable', 'string', 'max:255'],
            'server_prefix' => ['nullable', 'string', 'max:40'],
            'list_id' => ['nullable', 'string', 'max:80'],
            'webhook_secret' => ['nullable', 'string', 'max:255'],
        ]);

        AppSetting::setValue('mailchimp.enabled', $validated['enabled'] ? '1' : '0');
        AppSetting::setValue('mailchimp.server_prefix', $validated['server_prefix'] ?? null);
        AppSetting::setValue('mailchimp.list_id', $validated['list_id'] ?? null);
        if (filled($validated['api_key'] ?? null)) {
            AppSetting::setValue('mailchimp.api_key', $validated['api_key'], true);
        }
        if (filled($validated['webhook_secret'] ?? null)) {
            AppSetting::setValue('mailchimp.webhook_secret', $validated['webhook_secret'], true);
        }

        return $this->success($mailchimp->payload(), 'Mailchimp settings saved.');
    }

    public function testAdminMailchimp(MailchimpService $mailchimp): JsonResponse
    {
        try {
            $audience = $mailchimp->testConnection();
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Mailchimp connection failed. Check the saved settings and server logs.',
            ], 422);
        }

        return $this->success($audience, 'Mailchimp audience connected.');
    }

    public function syncAdminMailchimp(MailchimpService $mailchimp): JsonResponse
    {
        try {
            $result = $mailchimp->syncAll();
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Mailchimp sync failed. Check the saved settings and server logs.',
            ], 422);
        }

        return $this->success($result, "Mailchimp sync complete. {$result['synced']} synced, {$result['failed']} failed.");
    }

    public function mailchimpWebhook(Request $request, MailchimpService $mailchimp): JsonResponse
    {
        if (! $mailchimp->verifyWebhookSignature($request->header('X-Mailchimp-Signature'), $request->getContent())) {
            return response()->json(['message' => 'Invalid Mailchimp webhook signature.'], 400);
        }

        $mailchimp->handleWebhook($request->all());

        return $this->success(null, 'Mailchimp webhook received.');
    }

    public function testAdminEmailNotification(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
            'type' => ['required', Rule::in([
                'all',
                'newsletter_subscription',
                'event_registration',
                'opportunity_enquiry',
                'contact_enquiry',
                'email_verification',
                'password_reset',
                'two_factor_code',
                'customer_booking_update',
                'provider_booking_update',
                'verification_decision',
                'admin_alert',
                'announcement',
            ])],
        ]);

        $this->assertSmtpConfigured();
        app('mail.manager')->forgetMailers();

        $notifications = $this->sampleEmailNotifications($validated['type'], $validated['email'], $request->user());

        try {
            foreach ($notifications as $payload) {
                if ($payload['notifiable'] instanceof User) {
                    $payload['notifiable']->notify($payload['notification']);
                    continue;
                }

                Notification::route('mail', $validated['email'])->notify($payload['notification']);
            }
        } catch (\Throwable $exception) {
            report($exception);

            return response()->json([
                'message' => 'Notification test failed. Check the saved settings and server logs.',
            ], 422);
        }

        return $this->success([
            'email' => $validated['email'],
            'type' => $validated['type'],
            'sent' => count($notifications),
        ], count($notifications) === 1 ? 'Notification test email sent.' : 'Notification test emails sent.');
    }

    public function updateAdminFeatureSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider_whatsapp_notifications' => ['required', 'boolean'],
            'coming_soon' => ['required', 'boolean'],
        ]);

        AppSetting::setValue('features.provider_whatsapp_notifications', $validated['provider_whatsapp_notifications'] ? '1' : '0');
        AppSetting::setValue('features.coming_soon', $validated['coming_soon'] ? '1' : '0');

        return $this->success($this->featurePayload(), 'Feature settings saved.');
    }

    public function updateAdminBrandingSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'site_name' => ['nullable', 'string', 'max:120'],
            'logo_url' => ['nullable', 'string', 'max:500'],
            'email_logo_url' => ['nullable', 'string', 'max:500'],
            'favicon_url' => ['nullable', 'string', 'max:500'],
            'desktop_header_height' => ['nullable', 'integer', 'min:64', 'max:260'],
            'mobile_header_height' => ['nullable', 'integer', 'min:56', 'max:220'],
        ]);

        AppSetting::setValue('branding.site_name', $validated['site_name'] ?? null);
        AppSetting::setValue('branding.logo_url', $validated['logo_url'] ?? null);
        AppSetting::setValue('branding.email_logo_url', $validated['email_logo_url'] ?? null);
        AppSetting::setValue('branding.favicon_url', $validated['favicon_url'] ?? null);
        AppSetting::setValue('branding.desktop_header_height', $validated['desktop_header_height'] ?? 112);
        AppSetting::setValue('branding.mobile_header_height', $validated['mobile_header_height'] ?? 96);

        return $this->success($this->brandingPayload(), 'Branding settings saved.');
    }

    public function updateAdminCurrencySettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'default' => ['required', Rule::in(array_keys(config('currencies.supported', [])))],
            'rates' => ['required', 'array'],
            'rates.*' => ['required', 'numeric', 'min:0'],
        ]);

        $rates = collect($validated['rates'])
            ->only(array_keys(config('currencies.supported', [])))
            ->map(fn ($rate) => (float) $rate)
            ->all();
        $rates[$validated['default']] = $rates[$validated['default']] ?: 1;

        AppSetting::setValue('currency.default', $validated['default']);
        AppSetting::setValue('currency.rates', json_encode($rates));

        return $this->success($this->currencyPayload(), 'Currency settings saved.');
    }

    public function adminHeroImages(): JsonResponse
    {
        return $this->success([
            'images' => HomepageShell::adminHeroImages(),
        ]);
    }

    public function uploadAdminHeroImage(Request $request, UploadService $uploads): JsonResponse
    {
        $validated = $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:8192'],
        ]);

        $stored = $uploads->store($validated['image']);

        return $this->success($stored, 'Hero image uploaded.', 201);
    }

    public function updateAdminHeroImages(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'images' => ['required', 'array', 'max:8'],
            'images.*' => ['required', 'string', 'max:1000'],
        ]);

        HomepageShell::setAdminHeroImages($validated['images']);
        Cache::forget('home.hero.photos');

        return $this->success([
            'images' => HomepageShell::adminHeroImages(),
        ], 'Hero images updated.');
    }

    public function checkout(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isProvider(), 403);

        $validated = $request->validate([
            'plan' => ['required', 'in:paid'],
            'gateway' => ['nullable', Rule::in(['paystack', 'stripe'])],
        ]);

        $plan = SubscriptionPlan::where('key', $validated['plan'])->where('is_active', true)->firstOrFail();
        abort_if((float) $plan->price <= 0, 422, 'This plan does not require payment.');
        $gateway = $validated['gateway'] ?? $this->subscriptionGateway();

        if ($gateway === 'stripe') {
            return $this->stripeCheckout($user, $plan);
        }

        $secret = $this->paystackSecretKey();
        abort_if(blank($secret), 422, 'Paystack secret key is not configured.');

        $reference = 'BPHQ-SUB-'.$user->id.'-'.Str::upper(Str::random(12));
        $payment = SubscriptionPayment::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'gateway' => 'paystack',
            'reference' => $reference,
            'amount' => $plan->price,
            'currency' => $plan->currency,
            'status' => 'pending',
        ]);

        $response = Http::external()->withToken($secret)
            ->acceptJson()
            ->post('https://api.paystack.co/transaction/initialize', [
                'email' => $user->email,
                'amount' => (int) round(((float) $plan->price) * 100),
                'currency' => $plan->currency,
                'reference' => $reference,
                'callback_url' => url('/provider/subscription'),
                'metadata' => [
                    'type' => 'provider_subscription',
                    'user_id' => $user->id,
                    'subscription_payment_id' => $payment->id,
                    'plan' => $plan->key,
                    'plan_id' => $plan->id,
                ],
            ]);

        if (! $response->successful() || ! $response->json('status')) {
            $payment->update(['status' => 'failed', 'raw_response' => $response->json()]);
            return response()->json(['message' => $response->json('message') ?? 'Paystack could not initialize this subscription payment.'], 422);
        }

        $payment->update([
            'authorization_url' => $response->json('data.authorization_url'),
            'access_code' => $response->json('data.access_code'),
            'raw_response' => $response->json(),
        ]);

        return $this->success([
            'payment' => $payment->fresh('plan'),
            'authorization_url' => $payment->authorization_url,
            'reference' => $reference,
        ], 'Subscription checkout initialized.');
    }

    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reference' => ['required', 'string', 'exists:subscription_payments,reference'],
            'session_id' => ['nullable', 'string'],
        ]);

        $payment = SubscriptionPayment::where('reference', $validated['reference'])
            ->where('user_id', $request->user()->id)
            ->with('plan')
            ->firstOrFail();

        if ($payment->status === 'paid') {
            return $this->success($payment->load('subscription.planDefinition'), 'Subscription already active.');
        }

        if ($payment->gateway === 'stripe') {
            return $this->verifyStripePayment($payment, $validated['session_id'] ?? null);
        }

        $secret = $this->paystackSecretKey();
        abort_if(blank($secret), 422, 'Paystack secret key is not configured.');

        $response = Http::external()->withToken($secret)
            ->acceptJson()
            ->get('https://api.paystack.co/transaction/verify/'.$payment->reference);

        if (! $response->successful() || $response->json('data.status') !== 'success') {
            $payment->update([
                'status' => 'failed',
                'raw_response' => $response->json(),
            ]);
            return response()->json(['message' => $response->json('message') ?? 'Payment has not been confirmed by Paystack.'], 422);
        }

        if (! $this->paystackResponseMatchesPayment($response->json('data', []), $payment)) {
            $payment->update([
                'status' => 'failed',
                'raw_response' => $response->json(),
            ]);

            return response()->json(['message' => 'Payment verification failed because the Paystack response does not match this user, plan, amount, currency, and reference.'], 422);
        }

        [$subscription, $activated] = $this->activatePaidSubscription($payment, $response->json());
        if ($activated) {
            $this->notifySubscriptionActivated($subscription);
        }

        return $this->success($subscription->load('planDefinition'), 'Paid plan activated.');
    }

    public function downgrade(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isProvider(), 403);

        $free = SubscriptionPlan::where('key', 'free')->firstOrFail();

        $subscription = DB::transaction(function () use ($user, $free): Subscription {
            Subscription::where('user_id', $user->id)->where('status', 'active')->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'ends_at' => now(),
            ]);

            return Subscription::create([
                'user_id' => $user->id,
                'subscription_plan_id' => $free->id,
                'plan' => 'free',
                'status' => 'active',
                'amount' => 0,
                'currency' => $free->currency,
                'starts_at' => now(),
            ]);
        });
        $user->notify(new PlatformUpdateNotification(
            'Subscription changed',
            'Your account has been moved to the free plan.',
            'View subscription',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/subscription',
            ['subscription_id' => $subscription->id],
        ));

        return $this->success($subscription->load('planDefinition'), 'Your account has been moved to the free plan.');
    }

    private function paystackConfigured(): bool
    {
        return filled($this->paystackSecretKey());
    }

    private function stripeCheckout($user, SubscriptionPlan $plan): JsonResponse
    {
        $secret = $this->stripeSecretKey();
        abort_if(blank($secret), 422, 'Stripe secret key is not configured.');

        $reference = 'BPHQ-STRIPE-SUB-'.$user->id.'-'.Str::upper(Str::random(12));
        $payment = SubscriptionPayment::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'gateway' => 'stripe',
            'reference' => $reference,
            'amount' => $plan->price,
            'currency' => strtoupper($plan->currency),
            'status' => 'pending',
        ]);

        $response = Http::external()->withToken($secret)
            ->asForm()
            ->acceptJson()
            ->post('https://api.stripe.com/v1/checkout/sessions', [
                'mode' => 'payment',
                'client_reference_id' => $reference,
                'customer_email' => $user->email,
                'success_url' => url('/provider/subscription').'?reference='.$reference.'&session_id={CHECKOUT_SESSION_ID}',
                'cancel_url' => url('/provider/subscription'),
                'line_items[0][quantity]' => 1,
                'line_items[0][price_data][currency]' => strtolower($plan->currency),
                'line_items[0][price_data][unit_amount]' => (int) round(((float) $plan->price) * 100),
                'line_items[0][price_data][product_data][name]' => $plan->name,
                'metadata[type]' => 'provider_subscription',
                'metadata[user_id]' => $user->id,
                'metadata[subscription_payment_id]' => $payment->id,
                'metadata[plan_id]' => $plan->id,
                'metadata[plan]' => $plan->key,
            ]);

        if (! $response->successful() || blank($response->json('url'))) {
            $payment->update(['status' => 'failed', 'raw_response' => $response->json()]);
            return response()->json(['message' => $response->json('error.message') ?? 'Stripe could not initialize this subscription payment.'], 422);
        }

        $payment->update([
            'authorization_url' => $response->json('url'),
            'access_code' => $response->json('id'),
            'raw_response' => $response->json(),
        ]);

        return $this->success([
            'payment' => $payment->fresh('plan'),
            'authorization_url' => $payment->authorization_url,
            'reference' => $reference,
            'gateway' => 'stripe',
        ], 'Stripe checkout initialized.');
    }

    private function verifyStripePayment(SubscriptionPayment $payment, ?string $sessionId): JsonResponse
    {
        $secret = $this->stripeSecretKey();
        abort_if(blank($secret), 422, 'Stripe secret key is not configured.');
        $sessionId = $sessionId ?: $payment->access_code;
        abort_if(blank($sessionId), 422, 'Stripe checkout session is missing.');

        $response = Http::external()->withToken($secret)
            ->acceptJson()
            ->get('https://api.stripe.com/v1/checkout/sessions/'.$sessionId);

        if (! $response->successful() || $response->json('payment_status') !== 'paid') {
            $payment->update(['status' => 'failed', 'raw_response' => $response->json()]);
            return response()->json(['message' => $response->json('error.message') ?? 'Stripe payment has not been confirmed.'], 422);
        }

        if (! $this->stripeResponseMatchesPayment($response->json(), $payment)) {
            $payment->update(['status' => 'failed', 'raw_response' => $response->json()]);
            return response()->json(['message' => 'Stripe verification failed because the session does not match this user, plan, amount, currency, and reference.'], 422);
        }

        [$subscription, $activated] = $this->activatePaidSubscription($payment, $response->json());
        if ($activated) {
            $this->notifySubscriptionActivated($subscription);
        }

        return $this->success($subscription->load('planDefinition'), 'Paid plan activated.');
    }

    private function activatePaidSubscription(SubscriptionPayment $payment, array $rawResponse): array
    {
        return DB::transaction(function () use ($payment, $rawResponse): array {
            $locked = SubscriptionPayment::with('plan')->lockForUpdate()->findOrFail($payment->id);
            if ($locked->status === 'paid' && $locked->subscription_id) {
                return [Subscription::findOrFail($locked->subscription_id), false];
            }

            Subscription::where('user_id', $locked->user_id)->where('status', 'active')->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'ends_at' => now(),
            ]);

            $subscription = Subscription::create([
                'user_id' => $locked->user_id,
                'subscription_plan_id' => $locked->subscription_plan_id,
                'plan' => 'paid',
                'status' => 'active',
                'amount' => $locked->amount,
                'currency' => $locked->currency,
                'starts_at' => now(),
                'renews_at' => now()->addMonth(),
                'metadata' => ['gateway' => $locked->gateway],
            ]);

            $locked->update([
                'subscription_id' => $subscription->id,
                'status' => 'paid',
                'paid_at' => now(),
                'raw_response' => $rawResponse,
            ]);

            return [$subscription, true];
        });
    }

    private function notifySubscriptionActivated(Subscription $subscription): void
    {
        $subscription->loadMissing(['user', 'planDefinition']);
        $subscription->user?->notify(new PlatformUpdateNotification(
            'Paid plan activated',
            'Your BeautyPro HQ paid plan is now active.',
            'Open subscription',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/subscription',
            ['subscription_id' => $subscription->id, 'plan' => $subscription->plan],
        ));

        User::where('role', 'admin')->where('is_active', true)->get()->each->notify(new PlatformUpdateNotification(
            'Provider plan activated',
            ($subscription->user?->name ?? 'A provider').' activated the paid plan.',
            'View subscriptions',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/subscriptions',
            ['subscription_id' => $subscription->id, 'user_id' => $subscription->user_id],
        ));
    }

    private function assertSmtpConfigured(): void
    {
        abort_unless(AppSetting::getValue('smtp.enabled', '0') === '1', 422, 'SMTP is not enabled.');
        abort_if(blank(AppSetting::getValue('smtp.host')), 422, 'SMTP host is not configured.');
        abort_if(blank(AppSetting::getValue('smtp.port')), 422, 'SMTP port is not configured.');
        abort_if(blank(AppSetting::getValue('smtp.from_address')), 422, 'SMTP from address is not configured.');
    }

    private function sampleEmailNotifications(string $type, string $email, User $admin): array
    {
        $recipient = new User([
            'name' => 'BeautyPro HQ Test',
            'email' => $email,
            'role' => 'customer',
        ]);
        $recipient->setAttribute('id', $admin->id);

        $event = new Event([
            'title' => 'BPHQ Business Breakfast',
            'date' => now()->addWeeks(2),
            'location' => 'Lagos, Nigeria',
        ]);
        $registration = new EventRegistration([
            'name' => 'BeautyPro HQ Test',
            'email' => $email,
        ]);

        $opportunity = new Opportunity([
            'title' => 'Featured Beauty Brand Collaboration',
            'deadline' => now()->addMonth(),
        ]);
        $opportunityEnquiry = new OpportunityEnquiry([
            'name' => 'BeautyPro HQ Test',
            'email' => $email,
        ]);

        $contactEnquiry = new ContactEnquiry([
            'reason' => 'Partnership',
            'name' => 'BeautyPro HQ Test',
            'email' => $email,
        ]);

        $samples = [
            'newsletter_subscription' => ['notifiable' => null, 'notification' => new NewsletterSubscriptionConfirmation()],
            'event_registration' => ['notifiable' => null, 'notification' => new EventRegistrationConfirmation($event, $registration)],
            'opportunity_enquiry' => ['notifiable' => null, 'notification' => new OpportunityEnquiryConfirmation($opportunity, $opportunityEnquiry)],
            'contact_enquiry' => ['notifiable' => null, 'notification' => new ContactEnquiryConfirmation($contactEnquiry)],
            'email_verification' => ['notifiable' => $recipient, 'notification' => new BeautyProVerifyEmailNotification()],
            'password_reset' => ['notifiable' => $recipient, 'notification' => new BeautyProResetPasswordNotification('TEST-PASSWORD-RESET-TOKEN')],
            'two_factor_code' => ['notifiable' => $recipient, 'notification' => new TwoFactorCodeNotification('123456', 'login')],
            'customer_booking_update' => ['notifiable' => $recipient, 'notification' => new PlatformUpdateNotification('Customer booking update', 'This is a sample customer booking notification.', 'Open bookings', rtrim(config('app.frontend_url', config('app.url')), '/').'/customer/bookings')],
            'provider_booking_update' => ['notifiable' => $recipient, 'notification' => new PlatformUpdateNotification('Provider booking update', 'This is a sample provider booking and payment notification.', 'Open bookings', rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/bookings')],
            'verification_decision' => ['notifiable' => $recipient, 'notification' => new PlatformUpdateNotification('Verification decision sample', 'This is a sample provider verification decision notification.', 'Open profile', rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/profile')],
            'admin_alert' => ['notifiable' => $recipient, 'notification' => new PlatformUpdateNotification('Admin alert sample', 'This is a sample admin alert for activity requiring review.', 'Open admin activity', rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/activity')],
            'announcement' => ['notifiable' => $recipient, 'notification' => new PlatformUpdateNotification('Announcement sample', 'This is a sample announcement email for a selected audience.', 'Open dashboard', rtrim(config('app.frontend_url', config('app.url')), '/').'/customer')],
        ];

        return $type === 'all' ? array_values($samples) : [$samples[$type]];
    }

    private function stripeConfigured(): bool
    {
        return filled($this->stripeSecretKey());
    }

    private function stripeMode(): string
    {
        return AppSetting::getValue('stripe.mode', 'test') === 'live' ? 'live' : 'test';
    }

    private function stripeSecretKey(): ?string
    {
        return $this->stripeMode() === 'live'
            ? AppSetting::getValue('stripe.live_secret_key')
            : AppSetting::getValue('stripe.test_secret_key');
    }

    private function subscriptionGateway(): string
    {
        return AppSetting::getValue('payments.subscription_gateway', 'paystack') === 'stripe' ? 'stripe' : 'paystack';
    }

    private function paystackPublicKey(): ?string
    {
        return $this->paystackMode() === 'live'
            ? AppSetting::getValue('paystack.live_public_key')
            : (AppSetting::getValue('paystack.test_public_key') ?: config('services.paystack.public_key'));
    }

    private function paystackSecretKey(): ?string
    {
        return $this->paystackMode() === 'live'
            ? AppSetting::getValue('paystack.live_secret_key')
            : (AppSetting::getValue('paystack.test_secret_key') ?: config('services.paystack.secret_key'));
    }

    private function paystackMode(): string
    {
        return AppSetting::getValue('paystack.mode', 'test') === 'live' ? 'live' : 'test';
    }

    private function currencyPayload(): array
    {
        $default = AppSetting::getValue('currency.default') ?: config('currencies.default', 'NGN');
        $savedRates = json_decode((string) AppSetting::getValue('currency.rates', ''), true) ?: [];
        $supported = collect(config('currencies.supported', []))
            ->map(fn (array $currency, string $code) => [
                'code' => $code,
                'name' => $currency['name'],
                'symbol' => $currency['symbol'],
                'rate' => (float) ($savedRates[$code] ?? $currency['rate']),
            ])
            ->values()
            ->all();

        return [
            'default' => $default,
            'supported' => $supported,
        ];
    }

    private function featurePayload(): array
    {
        $comingSoon = AppSetting::getValue('features.coming_soon');

        return [
            'provider_whatsapp_notifications' => AppSetting::getValue('features.provider_whatsapp_notifications', '0') === '1',
            'coming_soon' => $comingSoon === null ? app()->environment('production') : $comingSoon === '1',
            'coming_soon_defaulted' => $comingSoon === null,
        ];
    }

    private function brandingPayload(): array
    {
        return [
            'site_name' => AppSetting::getValue('branding.site_name', config('app.name', 'BeautyPro HQ')),
            'logo_url' => AppSetting::getValue('branding.logo_url', '/brand/bphq-logo-transparent.svg'),
            'email_logo_url' => AppSetting::getValue('branding.email_logo_url', AppSetting::getValue('branding.logo_url', '/brand/bphq-logo-transparent.svg')),
            'favicon_url' => AppSetting::getValue('branding.favicon_url', '/brand/bphq-logo-transparent.svg'),
            'desktop_header_height' => (int) AppSetting::getValue('branding.desktop_header_height', 112),
            'mobile_header_height' => (int) AppSetting::getValue('branding.mobile_header_height', 96),
        ];
    }

    private function paystackResponseMatchesPayment(array $data, SubscriptionPayment $payment): bool
    {
        $metadata = (array) ($data['metadata'] ?? []);
        $paidAmount = (int) ($data['amount'] ?? 0);
        $expectedAmount = (int) round(((float) $payment->amount) * 100);
        $currency = strtoupper((string) ($data['currency'] ?? ''));

        return ($data['reference'] ?? null) === $payment->reference
            && $paidAmount === $expectedAmount
            && $currency === strtoupper((string) $payment->currency)
            && (string) ($metadata['type'] ?? '') === 'provider_subscription'
            && (int) ($metadata['user_id'] ?? 0) === (int) $payment->user_id
            && (int) ($metadata['subscription_payment_id'] ?? 0) === (int) $payment->id
            && (int) ($metadata['plan_id'] ?? 0) === (int) $payment->subscription_plan_id
            && (string) ($metadata['plan'] ?? '') === (string) $payment->plan?->key;
    }

    private function stripeResponseMatchesPayment(array $data, SubscriptionPayment $payment): bool
    {
        $metadata = (array) ($data['metadata'] ?? []);
        $paidAmount = (int) ($data['amount_total'] ?? 0);
        $expectedAmount = (int) round(((float) $payment->amount) * 100);
        $currency = strtoupper((string) ($data['currency'] ?? ''));

        return ($data['client_reference_id'] ?? null) === $payment->reference
            && ($data['id'] ?? null) === $payment->access_code
            && $paidAmount === $expectedAmount
            && $currency === strtoupper((string) $payment->currency)
            && (string) ($metadata['type'] ?? '') === 'provider_subscription'
            && (int) ($metadata['user_id'] ?? 0) === (int) $payment->user_id
            && (int) ($metadata['subscription_payment_id'] ?? 0) === (int) $payment->id
            && (int) ($metadata['plan_id'] ?? 0) === (int) $payment->subscription_plan_id
            && (string) ($metadata['plan'] ?? '') === (string) $payment->plan?->key;
    }
}
