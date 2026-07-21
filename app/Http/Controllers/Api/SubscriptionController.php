<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\User;
use App\Notifications\PlatformUpdateNotification;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
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
        return $this->success([
            'subscription' => $request->user()->activeSubscription()->with('planDefinition')->first(),
            'plans' => SubscriptionPlan::where('is_active', true)->orderBy('sort_order')->get(),
            'payments' => $request->user()->subscriptionPayments()->with('plan')->latest()->limit(10)->get(),
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

    public function adminSmtpSettings(): JsonResponse
    {
        $password = AppSetting::getValue('smtp.password');

        return $this->success([
            'enabled' => AppSetting::getValue('smtp.enabled', '0') === '1',
            'host' => AppSetting::getValue('smtp.host') ?: env('MAIL_HOST'),
            'port' => AppSetting::getValue('smtp.port') ?: env('MAIL_PORT', 587),
            'username' => AppSetting::getValue('smtp.username') ?: env('MAIL_USERNAME'),
            'encryption' => AppSetting::getValue('smtp.encryption') ?: env('MAIL_ENCRYPTION', 'tls'),
            'from_address' => AppSetting::getValue('smtp.from_address') ?: env('MAIL_FROM_ADDRESS'),
            'from_name' => AppSetting::getValue('smtp.from_name') ?: env('MAIL_FROM_NAME', config('app.name')),
            'password_configured' => filled($password ?: env('MAIL_PASSWORD')),
            'password_last4' => filled($password ?: env('MAIL_PASSWORD')) ? substr((string) ($password ?: env('MAIL_PASSWORD')), -4) : null,
            'configured' => AppSetting::getValue('smtp.enabled', '0') === '1'
                && filled(AppSetting::getValue('smtp.host') ?: env('MAIL_HOST'))
                && filled(AppSetting::getValue('smtp.port') ?: env('MAIL_PORT'))
                && filled(AppSetting::getValue('smtp.from_address') ?: env('MAIL_FROM_ADDRESS')),
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

    public function updateAdminFeatureSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider_whatsapp_notifications' => ['required', 'boolean'],
        ]);

        AppSetting::setValue('features.provider_whatsapp_notifications', $validated['provider_whatsapp_notifications'] ? '1' : '0');

        return $this->success($this->featurePayload(), 'Feature settings saved.');
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

        $response = Http::withToken($secret)
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

        $response = Http::withToken($secret)
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

        $subscription = $this->activatePaidSubscription($payment, $response->json());
        $this->notifySubscriptionActivated($subscription);

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

        $response = Http::withToken($secret)
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

        $response = Http::withToken($secret)
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

        $subscription = $this->activatePaidSubscription($payment, $response->json());
        $this->notifySubscriptionActivated($subscription);

        return $this->success($subscription->load('planDefinition'), 'Paid plan activated.');
    }

    private function activatePaidSubscription(SubscriptionPayment $payment, array $rawResponse): Subscription
    {
        return DB::transaction(function () use ($payment, $rawResponse): Subscription {
            Subscription::where('user_id', $payment->user_id)->where('status', 'active')->update([
                'status' => 'cancelled',
                'cancelled_at' => now(),
                'ends_at' => now(),
            ]);

            $subscription = Subscription::create([
                'user_id' => $payment->user_id,
                'subscription_plan_id' => $payment->subscription_plan_id,
                'plan' => 'paid',
                'status' => 'active',
                'amount' => $payment->amount,
                'currency' => $payment->currency,
                'starts_at' => now(),
                'renews_at' => now()->addMonth(),
                'metadata' => ['gateway' => $payment->gateway],
            ]);

            $payment->update([
                'subscription_id' => $subscription->id,
                'status' => 'paid',
                'paid_at' => now(),
                'raw_response' => $rawResponse,
            ]);

            return $subscription;
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
        return [
            'provider_whatsapp_notifications' => AppSetting::getValue('features.provider_whatsapp_notifications', '0') === '1',
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
