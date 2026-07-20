<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
            'paystack_configured' => filled(config('services.paystack.secret_key')),
        ]);
    }

    public function checkout(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user->isProvider(), 403);

        $validated = $request->validate([
            'plan' => ['required', 'in:paid'],
        ]);

        $plan = SubscriptionPlan::where('key', $validated['plan'])->where('is_active', true)->firstOrFail();
        abort_if((float) $plan->price <= 0, 422, 'This plan does not require payment.');

        $secret = config('services.paystack.secret_key');
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
                    'plan' => $plan->key,
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
        ]);

        $payment = SubscriptionPayment::where('reference', $validated['reference'])
            ->where('user_id', $request->user()->id)
            ->with('plan')
            ->firstOrFail();

        if ($payment->status === 'paid') {
            return $this->success($payment->load('subscription.planDefinition'), 'Subscription already active.');
        }

        $secret = config('services.paystack.secret_key');
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

        $subscription = DB::transaction(function () use ($payment, $response): Subscription {
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
                'metadata' => ['gateway' => 'paystack'],
            ]);

            $payment->update([
                'subscription_id' => $subscription->id,
                'status' => 'paid',
                'paid_at' => now(),
                'raw_response' => $response->json(),
            ]);

            return $subscription;
        });

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

        return $this->success($subscription->load('planDefinition'), 'Your account has been moved to the free plan.');
    }
}
