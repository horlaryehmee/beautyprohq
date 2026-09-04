<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\SmtpConnectionTestMail;
use App\Models\AppSetting;
use App\Models\ContactEnquiry;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\Opportunity;
use App\Models\OpportunityEnquiry;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Notifications\BeautyProResetPasswordNotification;
use App\Notifications\BeautyProVerifyEmailNotification;
use App\Notifications\ContactEnquiryConfirmation;
use App\Notifications\EventRegistrationConfirmation;
use App\Notifications\NewsletterSubscriptionConfirmation;
use App\Notifications\OpportunityEnquiryConfirmation;
use App\Notifications\PlatformUpdateNotification;
use App\Notifications\TwoFactorCodeNotification;
use App\Services\MailchimpService;
use App\Services\TwilioWhatsAppService;
use App\Support\CurrencyResolver;
use App\Support\HomepageShell;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class SubscriptionController extends Controller
{
    private const SUPPORTED_SUBSCRIPTION_CURRENCIES = ['NGN', 'USD'];

    public function plans(Request $request): JsonResponse
    {
        return $this->success([
            'detected_currency' => $this->subscriptionCurrencyForRequest($request),
            'plans' => $this->subscriptionPlansForRequest($request),
        ]);
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
            'currency' => ['sometimes', Rule::in(self::SUPPORTED_SUBSCRIPTION_CURRENCIES)],
            'billing_period' => ['sometimes', Rule::in(['daily', 'monthly', 'yearly'])],
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
        $user = $request->user();
        $user->expireElapsedPaidAccess();
        $user->restorePrematurelyCancelledPaidAccess();

        $payments = $user
            ->subscriptionPayments()
            ->with('plan')
            ->latest()
            ->paginate($this->perPage($request, 10, 50, 'payments_per_page'), ['*'], 'payments_page', max(1, $request->integer('payments_page', 1)));

        $accountCurrency = $this->accountCurrencyForRequest($request);

        return $this->success([
            'subscription' => $user->activeSubscription()->with('planDefinition')->first(),
            'subscription_history' => $user
                ->subscriptions()
                ->with('planDefinition')
                ->latest()
                ->limit(50)
                ->get(),
            'pending_paid_plan_selection' => $this->hasPendingPaidPlanSelection($user),
            'detected_currency' => $this->subscriptionCurrencyForRequest($request),
            'account_currency' => $accountCurrency,
            'subscription_currencies' => collect(CurrencyResolver::supportedPayload())
                ->whereIn('code', self::SUPPORTED_SUBSCRIPTION_CURRENCIES)
                ->values()
                ->all(),
            'plans' => $this->subscriptionPlansForRequest($request, $accountCurrency),
            'payments' => [
                'data' => $payments->items(),
                'meta' => $this->paginationMeta($payments),
            ],
            'paystack_configured' => $this->paystackConfigured(),
            'stripe_configured' => $this->stripeConfigured(),
            'subscription_gateway' => $this->subscriptionGateway(),
        ]);
    }

    private function hasPendingPaidPlanSelection(User $user): bool
    {
        if ($user->hasPaidPlan()) {
            return false;
        }

        return $user->subscriptions()
            ->whereIn('plan', ['paid', 'pro'])
            ->whereIn('status', ['expired', 'pending'])
            ->latest()
            ->get()
            ->contains(fn (Subscription $subscription): bool => (bool) ($subscription->metadata['selected_at_registration'] ?? false));
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
            'webhook_url' => url('/api/paystack/webhook'),
            'webhook_events' => [
                'subscription.create',
                'charge.success',
                'invoice.create',
                'invoice.update',
                'invoice.payment_failed',
                'subscription.not_renew',
                'subscription.disable',
                'subscription.expiring_cards',
            ],
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

    public function adminLiveChatSettings(): JsonResponse
    {
        $secret = AppSetting::getValue('live_chat.inbound_secret') ?: config('services.live_chat.inbound_secret');
        $domain = AppSetting::getValue('live_chat.reply_domain') ?: config('app.mail_reply_domain', config('app.url'));

        return $this->success([
            'inbound_secret_configured' => filled($secret),
            'inbound_secret_last4' => filled($secret) ? substr((string) $secret, -4) : null,
            'reply_domain' => $domain,
            'webhook_url' => rtrim(config('app.url'), '/').'/api/live-chat/mail/reply',
            'configured' => filled($secret) && filled($domain),
            'source' => [
                'secret' => filled(AppSetting::getValue('live_chat.inbound_secret')) ? 'admin_settings' : (filled(config('services.live_chat.inbound_secret')) ? 'env' : null),
                'domain' => filled(AppSetting::getValue('live_chat.reply_domain')) ? 'admin_settings' : 'env',
            ],
        ]);
    }

    public function updateAdminLiveChatSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'inbound_secret' => ['nullable', 'string', 'max:255'],
            'reply_domain' => ['nullable', 'string', 'max:255'],
        ]);

        if (filled($validated['inbound_secret'] ?? null)) {
            AppSetting::setValue('live_chat.inbound_secret', $validated['inbound_secret'], true);
        }
        AppSetting::setValue('live_chat.reply_domain', $validated['reply_domain'] ?? null);

        return $this->adminLiveChatSettings();
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
        $mailer = AppSetting::getValue('smtp.mailer', 'smtp');
        $password = AppSetting::getValue('smtp.password');
        $configuredEncryption = config('mail.mailers.smtp.scheme') === 'smtps'
            ? 'ssl'
            : ((bool) config('mail.mailers.smtp.require_tls') ? 'tls' : null);
        $enabled = AppSetting::getValue('smtp.enabled', '0') === '1';
        $fromAddress = AppSetting::getValue('smtp.from_address') ?: config('mail.from.address');

        return $this->success([
            'enabled' => $enabled,
            'mailer' => $mailer,
            'provider_label' => match ($mailer) {
                'google_workspace' => 'Google Workspace',
                'php_mail' => 'cPanel / PHP mail',
                default => 'Custom SMTP',
            },
            'host' => AppSetting::getValue('smtp.host') ?: config('mail.mailers.smtp.host'),
            'port' => AppSetting::getValue('smtp.port') ?: config('mail.mailers.smtp.port', 587),
            'username' => AppSetting::getValue('smtp.username') ?: config('mail.mailers.smtp.username'),
            'encryption' => AppSetting::getValue('smtp.encryption') ?: $configuredEncryption,
            'from_address' => $fromAddress,
            'from_name' => AppSetting::getValue('smtp.from_name') ?: config('mail.from.name', config('app.name')),
            'sendmail_path' => config('mail.mailers.php_mail.path'),
            'password_configured' => filled($password ?: config('mail.mailers.smtp.password')),
            'password_last4' => filled($password ?: config('mail.mailers.smtp.password')) ? substr((string) ($password ?: config('mail.mailers.smtp.password')), -4) : null,
            'configured' => $enabled
                && filled($fromAddress)
                && ($mailer === 'php_mail' || (
                    filled(AppSetting::getValue('smtp.host') ?: config('mail.mailers.smtp.host'))
                    && filled(AppSetting::getValue('smtp.port') ?: config('mail.mailers.smtp.port'))
                    && ($mailer !== 'google_workspace' || (
                        filled(AppSetting::getValue('smtp.username'))
                        && filled($password ?: config('mail.mailers.smtp.password'))
                    ))
                )),
        ]);
    }

    public function updateAdminSmtpSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'mailer' => ['nullable', Rule::in(['smtp', 'google_workspace', 'php_mail'])],
            'host' => ['nullable', 'string', 'max:255'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:500'],
            'encryption' => ['nullable', Rule::in(['', 'tls', 'ssl'])],
            'from_address' => ['nullable', 'email:rfc', 'max:255'],
            'from_name' => ['nullable', 'string', 'max:255'],
        ]);

        $mailer = $validated['mailer'] ?? 'smtp';
        $previousMailer = AppSetting::getValue('smtp.mailer', 'smtp');
        $host = $mailer === 'google_workspace' ? 'smtp.gmail.com' : ($validated['host'] ?? null);
        $port = $mailer === 'google_workspace' ? 587 : ($validated['port'] ?? null);
        $encryption = $mailer === 'google_workspace' ? 'tls' : ($validated['encryption'] ?? null);
        $username = $mailer === 'google_workspace'
            ? ($validated['username'] ?? $validated['from_address'] ?? null)
            : ($validated['username'] ?? null);

        AppSetting::setValue('smtp.enabled', $validated['enabled'] ? '1' : '0');
        AppSetting::setValue('smtp.mailer', $mailer);
        AppSetting::setValue('smtp.host', $host);
        AppSetting::setValue('smtp.port', $port);
        AppSetting::setValue('smtp.username', $username);
        AppSetting::setValue('smtp.encryption', $encryption);
        AppSetting::setValue('smtp.from_address', $validated['from_address'] ?? null);
        AppSetting::setValue('smtp.from_name', $validated['from_name'] ?? null);
        if (filled($validated['password'] ?? null)) {
            AppSetting::setValue('smtp.password', $validated['password'], true);
        } elseif ($previousMailer !== $mailer && $mailer !== 'php_mail') {
            AppSetting::setValue('smtp.password', null, true);
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
        if ($validated['coming_soon'] && blank(AppSetting::getValue('features.coming_soon_bypass_token'))) {
            AppSetting::setValue('features.coming_soon_bypass_token', Str::random(48), true);
        }

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

    public function fetchCurrencyRates(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'default' => ['nullable', Rule::in(array_keys(config('currencies.supported', [])))],
        ]);

        $base = $validated['default'] ?? (AppSetting::getValue('currency.default') ?: config('currencies.default', 'NGN'));
        $supported = collect(config('currencies.supported', []));

        try {
            $response = Http::external()
                ->timeout(15)
                ->get('https://open.er-api.com/v6/latest/'.$base);

            if (! $response->successful()) {
                throw new \RuntimeException('Exchange rate API returned '.$response->status());
            }

            $rates = $response->json('rates') ?: [];
            $fetched = $supported->mapWithKeys(fn (array $currency, string $code) => [
                $code => (float) ($rates[$code] ?? 0),
            ])->all();

            // The API returns rates relative to `$base`; the platform expects the
            // base currency's own rate to be exactly 1.
            $fetched[$base] = 1.0;

            if (collect($fetched)->filter(fn ($rate) => $rate > 0)->isEmpty()) {
                throw new \RuntimeException('No exchange rates returned.');
            }

            return $this->success([
                'base' => $base,
                'rates' => $fetched,
                'source' => 'open.er-api.com (ECB/published rates)',
            ], 'Live exchange rates fetched.');
        } catch (\Throwable $exception) {
            Log::warning('Currency rate fetch failed.', [
                'message' => $exception->getMessage(),
                'base' => $base,
            ]);

            return response()->json([
                'message' => 'Could not fetch live exchange rates. Check the server internet connection and try again.',
            ], 502);
        }
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
        $url = $stored['url'] ?? '';
        // Ensure the URL is absolute for the browser to load it
        if ($url && ! preg_match('#^(https?:)?//#', $url)) {
            $url = rtrim(config('app.url'), '/').'/'.ltrim($url, '/');
        }

        return $this->success([
            'url' => $url,
            'path' => $stored['path'] ?? '',
            'filename' => $stored['filename'] ?? '',
        ], 'Hero image uploaded.', 201);
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
            'plan' => ['required', 'string', 'max:50'],
            'gateway' => ['nullable', Rule::in(['paystack', 'stripe'])],
            'currency' => ['nullable', Rule::in(self::SUPPORTED_SUBSCRIPTION_CURRENCIES)],
        ]);

        $plan = SubscriptionPlan::where('key', $validated['plan'])->where('is_active', true)->firstOrFail();
        abort_if((float) $plan->price <= 0, 422, 'This plan does not require payment.');
        $gateway = $validated['gateway'] ?? $this->subscriptionGateway();
        $checkoutCurrency = strtoupper($validated['currency'] ?? $this->accountCurrencyForRequest($request));
        $checkoutAmount = CurrencyResolver::convert((float) $plan->price, $plan->currency, $checkoutCurrency);

        if ($gateway === 'stripe') {
            return $this->stripeCheckout($user, $plan, $checkoutAmount, $checkoutCurrency);
        }

        $secret = $this->paystackSecretKey();
        abort_if(blank($secret), 422, 'Paystack secret key is not configured.');
        $paystackPlanCode = $this->paystackPlanCode($plan, $checkoutAmount, $checkoutCurrency, $secret);

        $reference = 'BPHQ-SUB-'.$user->id.'-'.Str::upper(Str::random(12));
        $payment = SubscriptionPayment::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'gateway' => 'paystack',
            'reference' => $reference,
            'amount' => $checkoutAmount,
            'currency' => $checkoutCurrency,
            'status' => 'pending',
        ]);

        $paystackMetadata = [
            'type' => 'provider_subscription',
            'user_id' => $user->id,
            'subscription_payment_id' => $payment->id,
            'plan' => $plan->key,
            'plan_id' => $plan->id,
            'paystack_plan_code' => $paystackPlanCode,
        ];

        $response = Http::external()->withToken($secret)
            ->acceptJson()
            ->post('https://api.paystack.co/transaction/initialize', [
                'email' => $user->email,
                'amount' => (int) round($checkoutAmount * 100),
                'currency' => $checkoutCurrency,
                'plan' => $paystackPlanCode,
                'channels' => ['card'],
                'reference' => $reference,
                'callback_url' => url('/provider/subscription'),
                'metadata' => $paystackMetadata,
            ]);

        if (! $response->successful() || ! $response->json('status')) {
            $payment->update(['status' => 'failed', 'raw_response' => $response->json()]);

            return response()->json(['message' => $response->json('message') ?? 'Paystack could not initialize this subscription payment.'], 422);
        }

        $payment->update([
            'authorization_url' => $response->json('data.authorization_url'),
            'access_code' => $response->json('data.access_code'),
            'raw_response' => array_replace_recursive($response->json(), [
                'data' => [
                    'metadata' => $paystackMetadata,
                    'plan' => ['plan_code' => $paystackPlanCode],
                ],
            ]),
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
            $this->notifySubscriptionPaymentReceipt($payment->fresh(['user', 'plan', 'subscription']));
        }

        return $this->success($subscription->load('planDefinition'), 'Paid plan activated.');
    }

    public function downgrade(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isProvider(), 403);
        $active = $user->activeSubscription()->first();
        if ($active?->isPaid()) {
            try {
                $this->disablePaystackSubscriptionIfPossible($active);
            } catch (\Throwable $exception) {
                report($exception);
                // Best-effort: local cancellation always proceeds even if the gateway call fails.
            }
        }

        $subscription = DB::transaction(function () use ($user): Subscription {
            $active = $user->activeSubscription()->lockForUpdate()->first();
            abort_unless($active, 422, 'No active subscription was found.');

            if (! $active->isPaid()) {
                return $active;
            }

            $endsAt = $active->renews_at ?: $this->nextRenewalDate($active->planDefinition);
            $metadata = $active->metadata ?? [];
            $metadata['cancel_at_period_end'] = true;
            $metadata['cancel_requested_at'] = now()->toIso8601String();
            $metadata['access_ends_at'] = $endsAt->toIso8601String();

            $active->update([
                'status' => 'active',
                'ends_at' => $endsAt,
                'cancelled_at' => now(),
                'metadata' => $metadata,
            ]);

            return $active->fresh();
        });
        $user->notify(new PlatformUpdateNotification(
            'Subscription cancellation scheduled',
            'Your paid plan renewal has been cancelled. You will keep paid provider tools until the current subscription period ends.',
            'View subscription',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/subscription',
            ['subscription_id' => $subscription->id],
        ));
        Cache::forget('public.home.payload.v6');
        Cache::forget('public.home.payload.v5');

        return $this->success($subscription->load('planDefinition'), 'Your subscription will remain active until the current paid period ends.');
    }

    public function paystackWebhook(Request $request): JsonResponse
    {
        $secret = $this->paystackSecretKey();
        abort_if(blank($secret), 422, 'Paystack secret key is not configured.');

        $signature = (string) $request->header('X-Paystack-Signature');
        abort_unless(hash_equals(hash_hmac('sha512', $request->getContent(), $secret), $signature), 401, 'Invalid Paystack signature.');

        $event = (string) $request->input('event');
        $data = (array) $request->input('data', []);

        if ($event === 'subscription.create') {
            $this->storePaystackSubscriptionDetails($data);
        } elseif ($event === 'charge.success') {
            $this->recordPaystackCharge($data, $request->all());
        } elseif (in_array($event, ['invoice.create', 'invoice.update', 'invoice.payment_failed', 'subscription.expiring_cards'], true)) {
            $this->recordPaystackInvoiceEvent($event, $data);
        } elseif ($event === 'subscription.not_renew') {
            $this->markPaystackSubscriptionNotRenewing($data);
        } elseif ($event === 'subscription.disable') {
            $this->markPaystackSubscriptionDisabled($data);
        }

        return response()->json(['ok' => true]);
    }

    private function subscriptionPlansForRequest(Request $request, ?string $displayCurrency = null): array
    {
        $displayCurrency ??= $this->subscriptionCurrencyForRequest($request);

        return SubscriptionPlan::where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn (SubscriptionPlan $plan): array => CurrencyResolver::planPayload($plan, $displayCurrency))
            ->all();
    }

    private function accountCurrencyForRequest(Request $request): string
    {
        $supported = self::SUPPORTED_SUBSCRIPTION_CURRENCIES;
        $currency = strtoupper((string) (
            $request->user()?->providerProfile?->default_currency
            ?: $request->user()?->preferred_currency
            ?: ''
        ));

        return in_array($currency, $supported, true)
            ? $currency
            : $this->subscriptionCurrencyForRequest($request);
    }

    private function subscriptionCurrencyForRequest(Request $request): string
    {
        return CurrencyResolver::currencyForRequest($request) === 'NGN' ? 'NGN' : 'USD';
    }

    private function paystackConfigured(): bool
    {
        return filled($this->paystackSecretKey());
    }

    private function paystackPlanCode(SubscriptionPlan $plan, float $amount, string $currency, string $secret): string
    {
        $amountInSubunit = (int) round($amount * 100);
        $currency = strtoupper($currency);
        $interval = $this->paystackIntervalForPlan($plan);
        $settingKey = "paystack.plan_code.{$this->paystackMode()}.{$plan->key}.{$currency}.{$interval}.{$amountInSubunit}";
        $saved = AppSetting::getValue($settingKey);
        if (filled($saved)) {
            return (string) $saved;
        }

        $response = Http::external()->withToken($secret)
            ->acceptJson()
            ->post('https://api.paystack.co/plan', [
                'name' => "{$plan->name} ({$currency})",
                'amount' => $amountInSubunit,
                'interval' => $interval,
                'currency' => $currency,
                'invoice_limit' => 0,
            ]);

        abort_unless($response->successful() && $response->json('status') && filled($response->json('data.plan_code')), 422, $response->json('message') ?: 'Paystack subscription plan could not be created.');

        $planCode = (string) $response->json('data.plan_code');
        AppSetting::setValue($settingKey, $planCode);

        return $planCode;
    }

    private function paystackIntervalForPlan(SubscriptionPlan $plan): string
    {
        return match ($plan->billing_period) {
            'daily' => 'daily',
            'yearly' => 'annually',
            default => 'monthly',
        };
    }

    private function nextRenewalDate(?SubscriptionPlan $plan): Carbon
    {
        return match ($plan?->billing_period) {
            'daily' => now()->addDay(),
            'yearly' => now()->addYear(),
            default => now()->addMonth(),
        };
    }

    private function disablePaystackSubscriptionIfPossible(Subscription $subscription): void
    {
        $metadata = $subscription->metadata ?? [];
        if (($metadata['gateway'] ?? null) !== 'paystack') {
            return;
        }

        $code = $metadata['paystack_subscription_code'] ?? null;
        $token = $subscription->gatewaySecret('paystack_email_token');
        if (blank($code) || blank($token)) {
            $payment = SubscriptionPayment::where('subscription_id', $subscription->id)
                ->where('gateway', 'paystack')
                ->where('status', 'paid')
                ->latest()
                ->first();

            $payload = $payment?->gatewayPayload() ?? [];
            $code ??= data_get($payload, 'data.subscription.subscription_code')
                ?: data_get($payload, 'data.subscription_code');
            $token ??= data_get($payload, 'data.subscription.email_token')
                ?: data_get($payload, 'data.email_token');
        }

        abort_if(blank($code) || blank($token), 422, 'Paystack subscription details are incomplete. Wait for Paystack to finish creating the subscription, then try again.');

        $secret = $this->paystackSecretKey();
        abort_if(blank($secret), 422, 'Paystack secret key is not configured.');

        $response = Http::external()->withToken($secret)
            ->acceptJson()
            ->post('https://api.paystack.co/subscription/disable', [
                'code' => $code,
                'token' => $token,
            ]);

        abort_unless($response->successful() && $response->json('status'), 422, $response->json('message') ?: 'Paystack subscription could not be disabled.');

        $subscription->update([
            'metadata' => array_merge($metadata, [
                'gateway' => 'paystack',
                'paystack_subscription_code' => $code,
                'paystack_email_token' => $token,
                'paystack_status' => 'non-renewing',
                'paystack_cancel_requested_at' => now()->toIso8601String(),
            ]),
        ]);
    }

    private function storePaystackSubscriptionDetails(array $data): void
    {
        $planCode = data_get($data, 'plan.plan_code') ?: data_get($data, 'plan');
        $email = data_get($data, 'customer.email');
        $code = data_get($data, 'subscription_code');
        $token = data_get($data, 'email_token');

        if (! $planCode || ! $email || ! $code || ! $token) {
            return;
        }

        $payment = SubscriptionPayment::where('gateway', 'paystack')
            ->where('status', 'pending')
            ->where('raw_response->data->metadata->paystack_plan_code', $planCode)
            ->where('raw_response->data->metadata->type', 'provider_subscription')
            ->whereHas('user', fn ($query) => $query->where('email', $email))
            ->latest()
            ->first();

        if ($payment) {
            $rawResponse = $payment->gatewayPayload();
            data_set($rawResponse, 'data.subscription_code', $code);
            data_set($rawResponse, 'data.email_token', $token);
            data_set($rawResponse, 'data.plan.plan_code', $planCode);
            data_set($rawResponse, 'data.next_payment_date', data_get($data, 'next_payment_date'));

            $payment->update(['raw_response' => $rawResponse]);
        }

        $subscription = Subscription::where('status', 'active')
            ->where('plan', 'paid')
            ->whereHas('user', fn ($query) => $query->where('email', $email))
            ->latest()
            ->first();

        if (! $subscription) {
            return;
        }

        $metadata = $subscription->metadata ?? [];
        if (($metadata['paystack_plan_code'] ?? null) && $metadata['paystack_plan_code'] !== $planCode) {
            return;
        }

        $metadata['gateway'] = 'paystack';
        $metadata['paystack_plan_code'] = $planCode;
        $metadata['paystack_subscription_code'] = $code;
        $metadata['paystack_email_token'] = $token;

        $subscription->update([
            'renews_at' => data_get($data, 'next_payment_date') ? Carbon::parse(data_get($data, 'next_payment_date')) : $subscription->renews_at,
            'metadata' => $metadata,
        ]);
    }

    private function recordPaystackCharge(array $data, array $rawPayload): void
    {
        $metadata = (array) ($data['metadata'] ?? []);
        $reference = (string) ($data['reference'] ?? '');

        if (($metadata['type'] ?? null) === 'provider_subscription' && $reference) {
            $payment = SubscriptionPayment::where('reference', $reference)->with('plan')->first();
            if ($payment && $payment->status !== 'paid' && $this->paystackResponseMatchesPayment($data, $payment)) {
                [$subscription, $activated] = $this->activatePaidSubscription($payment, $this->mergePaystackSubscriptionPayload($payment, $rawPayload));
                if ($activated) {
                    $this->notifySubscriptionActivated($subscription);
                    $this->notifySubscriptionPaymentReceipt($payment->fresh(['user', 'plan', 'subscription']));
                }
            }

            return;
        }

        $code = data_get($data, 'subscription.subscription_code');
        if (! $code || ! $reference || SubscriptionPayment::where('reference', $reference)->exists()) {
            return;
        }

        $subscription = Subscription::where('metadata->paystack_subscription_code', $code)
            ->first();

        if (! $subscription) {
            return;
        }

        $payment = SubscriptionPayment::create([
            'user_id' => $subscription->user_id,
            'subscription_id' => $subscription->id,
            'subscription_plan_id' => $subscription->subscription_plan_id,
            'gateway' => 'paystack',
            'reference' => $reference,
            'amount' => ((float) ($data['amount'] ?? 0)) / 100,
            'currency' => strtoupper((string) ($data['currency'] ?? $subscription->currency)),
            'status' => 'paid',
            'paid_at' => now(),
            'raw_response' => $rawPayload,
        ]);

        $subscription->update([
            'status' => 'active',
            'amount' => $payment->amount,
            'currency' => $payment->currency,
            'starts_at' => now(),
            'renews_at' => data_get($data, 'subscription.next_payment_date') ? Carbon::parse(data_get($data, 'subscription.next_payment_date')) : $this->nextRenewalDate($subscription->planDefinition),
            'ends_at' => null,
            'cancelled_at' => null,
            'metadata' => array_merge($subscription->metadata ?? [], [
                'gateway' => 'paystack',
                'paystack_email_token' => data_get($data, 'subscription.email_token') ?: $subscription->gatewaySecret('paystack_email_token'),
            ]),
        ]);

        $this->notifySubscriptionPaymentReceipt($payment->load(['user', 'plan', 'subscription']));
    }

    private function recordPaystackInvoiceEvent(string $event, array $data): void
    {
        if ($event === 'subscription.expiring_cards' && array_is_list($data)) {
            foreach ($data as $item) {
                $this->recordPaystackInvoiceEvent($event, (array) $item);
            }

            return;
        }

        $code = data_get($data, 'subscription.subscription_code');
        if (! $code) {
            return;
        }

        $subscription = Subscription::where('metadata->paystack_subscription_code', $code)->latest()->first();
        if (! $subscription) {
            return;
        }

        $metadata = array_merge($subscription->metadata ?? [], [
            'gateway' => 'paystack',
            'paystack_last_event' => $event,
            'paystack_last_invoice_code' => data_get($data, 'invoice_code'),
            'paystack_last_invoice_status' => data_get($data, 'status'),
            'paystack_last_invoice_description' => data_get($data, 'description'),
        ]);

        if ($event === 'invoice.payment_failed') {
            $metadata['paystack_status'] = 'attention';
        }

        if ($event === 'subscription.expiring_cards') {
            $metadata['paystack_status'] = 'attention';
            $metadata['paystack_expiring_card'] = [
                'expiry_date' => data_get($data, 'expiry_date'),
                'description' => data_get($data, 'description'),
                'brand' => data_get($data, 'brand'),
            ];
        }

        $subscription->update([
            'renews_at' => data_get($data, 'subscription.next_payment_date') ? Carbon::parse(data_get($data, 'subscription.next_payment_date')) : $subscription->renews_at,
            'metadata' => $metadata,
        ]);
    }

    private function markPaystackSubscriptionNotRenewing(array $data): void
    {
        $this->updatePaystackSubscriptionState($data, [
            'cancel_at_period_end' => true,
            'paystack_status' => 'non-renewing',
        ], false);
    }

    private function markPaystackSubscriptionDisabled(array $data): void
    {
        $this->updatePaystackSubscriptionState($data, [
            'cancel_at_period_end' => true,
            'paystack_status' => 'cancelled',
        ], false);
    }

    private function updatePaystackSubscriptionState(array $data, array $metadata, bool $ended): void
    {
        $code = data_get($data, 'subscription_code') ?: data_get($data, 'subscription.subscription_code');
        if (! $code) {
            return;
        }

        $subscription = Subscription::where('metadata->paystack_subscription_code', $code)->latest()->first();
        if (! $subscription) {
            return;
        }

        $subscription->update([
            'status' => $ended ? 'cancelled' : $subscription->status,
            'ends_at' => $ended ? now() : ($subscription->ends_at ?: ($subscription->renews_at ?: $this->nextRenewalDate($subscription->planDefinition))),
            'cancelled_at' => $subscription->cancelled_at ?: now(),
            'metadata' => array_merge($subscription->metadata ?? [], $metadata),
        ]);
    }

    private function stripeCheckout($user, SubscriptionPlan $plan, float $checkoutAmount, string $checkoutCurrency): JsonResponse
    {
        $secret = $this->stripeSecretKey();
        abort_if(blank($secret), 422, 'Stripe secret key is not configured.');

        $reference = 'BPHQ-STRIPE-SUB-'.$user->id.'-'.Str::upper(Str::random(12));
        $payment = SubscriptionPayment::create([
            'user_id' => $user->id,
            'subscription_plan_id' => $plan->id,
            'gateway' => 'stripe',
            'reference' => $reference,
            'amount' => $checkoutAmount,
            'currency' => strtoupper($checkoutCurrency),
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
                'line_items[0][price_data][currency]' => strtolower($checkoutCurrency),
                'line_items[0][price_data][unit_amount]' => (int) round($checkoutAmount * 100),
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
            $this->notifySubscriptionPaymentReceipt($payment->fresh(['user', 'plan', 'subscription']));
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

            $lockedPayload = $locked->gatewayPayload();
            $subscription = Subscription::create([
                'user_id' => $locked->user_id,
                'subscription_plan_id' => $locked->subscription_plan_id,
                'plan' => 'paid',
                'status' => 'active',
                'amount' => $locked->amount,
                'currency' => $locked->currency,
                'starts_at' => now(),
                'renews_at' => $this->nextRenewalDate($locked->plan),
                'metadata' => array_filter([
                    'gateway' => $locked->gateway,
                    'paystack_plan_code' => data_get($rawResponse, 'data.plan.plan_code') ?: data_get($rawResponse, 'data.plan') ?: data_get($lockedPayload, 'data.metadata.paystack_plan_code'),
                    'paystack_subscription_code' => data_get($rawResponse, 'data.subscription.subscription_code') ?: data_get($rawResponse, 'data.subscription_code') ?: data_get($lockedPayload, 'data.subscription_code') ?: data_get($lockedPayload, 'data.subscription.subscription_code'),
                    'paystack_email_token' => data_get($rawResponse, 'data.subscription.email_token') ?: data_get($rawResponse, 'data.email_token') ?: data_get($lockedPayload, 'data.email_token') ?: data_get($lockedPayload, 'data.subscription.email_token'),
                ]),
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

    private function notifySubscriptionPaymentReceipt(?SubscriptionPayment $payment): void
    {
        if (! $payment || $payment->status !== 'paid') {
            return;
        }

        $payment->loadMissing(['user', 'plan', 'subscription']);
        $user = $payment->user;
        if (! $user) {
            return;
        }

        $user->notify(new PlatformUpdateNotification(
            'Subscription payment receipt',
            'Your BeautyPro HQ subscription payment was received successfully.',
            'View subscription',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/subscription',
            [
                'subscription_id' => $payment->subscription_id,
                'subscription_payment_id' => $payment->id,
                'details' => [
                    'Plan' => $payment->plan?->name ?? 'Subscription plan',
                    'Amount' => strtoupper((string) $payment->currency).' '.number_format((float) $payment->amount, 2),
                    'Payment method' => ucfirst((string) $payment->gateway),
                    'Payment reference' => $payment->reference,
                    'Paid at' => optional($payment->paid_at)->format('M j, Y g:i A'),
                ],
            ],
        ));
    }

    private function mergePaystackSubscriptionPayload(SubscriptionPayment $payment, array $rawPayload): array
    {
        $paymentPayload = $payment->gatewayPayload();
        foreach ([
            'subscription_code',
            'email_token',
            'next_payment_date',
        ] as $key) {
            $value = data_get($paymentPayload, 'data.'.$key);
            if (filled($value) && blank(data_get($rawPayload, 'data.'.$key))) {
                data_set($rawPayload, 'data.'.$key, $value);
            }
        }

        $planCode = data_get($paymentPayload, 'data.plan.plan_code') ?: data_get($paymentPayload, 'data.metadata.paystack_plan_code');
        if (filled($planCode) && blank(data_get($rawPayload, 'data.plan.plan_code'))) {
            data_set($rawPayload, 'data.plan.plan_code', $planCode);
        }

        return $rawPayload;
    }

    private function assertSmtpConfigured(): void
    {
        abort_unless(AppSetting::getValue('smtp.enabled', '0') === '1', 422, 'Email sending is not enabled.');
        abort_if(blank(AppSetting::getValue('smtp.from_address')), 422, 'From address is not configured.');

        if (in_array(AppSetting::getValue('smtp.mailer', 'smtp'), ['smtp', 'google_workspace'], true)) {
            abort_if(blank(AppSetting::getValue('smtp.host')), 422, 'SMTP host is not configured.');
            abort_if(blank(AppSetting::getValue('smtp.port')), 422, 'SMTP port is not configured.');
        }
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
            'newsletter_subscription' => ['notifiable' => null, 'notification' => new NewsletterSubscriptionConfirmation],
            'event_registration' => ['notifiable' => null, 'notification' => new EventRegistrationConfirmation($event, $registration)],
            'opportunity_enquiry' => ['notifiable' => null, 'notification' => new OpportunityEnquiryConfirmation($opportunity, $opportunityEnquiry)],
            'contact_enquiry' => ['notifiable' => null, 'notification' => new ContactEnquiryConfirmation($contactEnquiry)],
            'email_verification' => ['notifiable' => $recipient, 'notification' => new BeautyProVerifyEmailNotification],
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
        $enabled = $comingSoon === null ? app()->environment('production') : $comingSoon === '1';
        $bypassUrl = null;

        if ($enabled) {
            $token = AppSetting::getValue('features.coming_soon_bypass_token');
            if (blank($token)) {
                $token = Str::random(48);
                AppSetting::setValue('features.coming_soon_bypass_token', $token, true);
            }

            $bypassUrl = route('coming-soon.bypass', ['token' => $token]);
        }

        return [
            'provider_whatsapp_notifications' => AppSetting::getValue('features.provider_whatsapp_notifications', '0') === '1',
            'coming_soon' => $enabled,
            'coming_soon_defaulted' => $comingSoon === null,
            'coming_soon_bypass_url' => $bypassUrl,
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
