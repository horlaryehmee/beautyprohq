<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\Payment;
use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\Service;
use App\Models\User;
use App\Notifications\BookingStatusNotification;
use App\Notifications\PlatformUpdateNotification;
use App\Services\TwilioWhatsAppService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class BookingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::where('customer_id', $request->user()->id)
            ->with(['provider.user:id,name', 'service', 'payment', 'review'])
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('date')->orderByDesc('time')->paginate($request->integer('per_page', 15));

        return $this->success($bookings->items(), meta: $this->paginationMeta($bookings));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider_id' => ['required', 'integer', 'exists:provider_profiles,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'time' => ['required', 'date_format:H:i'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'custom_fields' => ['nullable', 'array'],
            'redeem_loyalty' => ['nullable', 'boolean'],
            'customer.name' => ['required', 'string', 'max:120'],
            'customer.email' => ['required', 'email:rfc', 'max:255'],
            'customer.phone' => ['required', 'string', 'max:40'],
        ]);

        $request->user()->update([
            'name' => $validated['customer']['name'],
            'phone' => $validated['customer']['phone'],
        ]);
        unset($validated['customer']);

        return $this->createBooking($request, $validated, $request->user());
    }

    public function guestStore(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider_id' => ['required', 'integer', 'exists:provider_profiles,id'],
            'service_id' => ['required', 'integer', 'exists:services,id'],
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'time' => ['required', 'date_format:H:i'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'custom_fields' => ['nullable', 'array'],
            'redeem_loyalty' => ['nullable', 'boolean'],
            'customer.name' => ['required', 'string', 'max:120'],
            'customer.email' => ['required', 'email:rfc', 'max:255'],
            'customer.phone' => ['required', 'string', 'max:40'],
        ]);

        $email = Str::lower(trim($validated['customer']['email']));
        $customer = User::where('email', $email)->first();
        if ($customer && ! $customer->isCustomer()) {
            return response()->json(['message' => 'Please use a customer email address for this booking.'], 422);
        }

        $customer ??= User::create([
            'name' => $validated['customer']['name'],
            'email' => $email,
            'phone' => $validated['customer']['phone'] ?? null,
            'password' => Hash::make(Str::random(32)),
            'role' => 'customer',
            'is_guest' => true,
            'preferred_currency' => config('currencies.default', 'NGN'),
        ]);

        if (! $customer->phone && ! empty($validated['customer']['phone'])) {
            $customer->update(['phone' => $validated['customer']['phone']]);
        }

        unset($validated['customer']);

        return $this->createBooking($request, $validated, $customer);
    }

    private function createBooking(Request $request, array $validated, User $customer): JsonResponse
    {
        $provider = ProviderProfile::directory()->findOrFail($validated['provider_id']);
        if (! $provider->user->hasPaidPlan()) {
            return response()->json(['message' => 'This provider is not accepting direct bookings on BeautyPro HQ.'], 422);
        }
        $service = Service::whereKey($validated['service_id'])->where('provider_id', $provider->id)->where('is_active', true)->firstOrFail();
        $customFields = $this->validatedCustomBookingFields($provider, $validated['custom_fields'] ?? []);
        $redeemLoyalty = (bool) ($validated['redeem_loyalty'] ?? false);
        unset($validated['custom_fields']);
        unset($validated['redeem_loyalty']);
        $date = Carbon::createFromFormat('Y-m-d H:i', $validated['date'].' '.$validated['time']);
        $end = $date->copy()->addMinutes($service->duration_minutes);

        if ($date->isPast()) {
            return response()->json(['message' => 'Please select a future booking time.'], 422);
        }

        $isWithinAvailability = $provider->availability()
            ->where('is_active', true)
            ->where('day_of_week', $date->dayOfWeek)
            ->where('start_time', '<=', $date->format('H:i:s'))
            ->where('end_time', '>=', $end->format('H:i:s'))
            ->exists();

        if (! $isWithinAvailability) {
            return response()->json(['message' => 'That time is outside the provider’s availability.'], 422);
        }

        $blocked = $provider->blockedDates()->whereDate('date', $date)->get()->contains(function ($block) use ($date, $end): bool {
            if (! $block->start_time || ! $block->end_time) {
                return true;
            }

            return $date->format('H:i:s') < $block->end_time && $end->format('H:i:s') > $block->start_time;
        });

        if ($blocked) {
            return response()->json(['message' => 'That date or time is blocked by the provider.'], 422);
        }

        $booking = DB::transaction(function () use ($provider, $service, $customer, $validated, $end, $customFields, $redeemLoyalty): ?Booking {
            $conflict = Booking::where('provider_id', $provider->id)
                ->whereDate('date', $validated['date'])
                ->whereIn('status', ['pending', 'confirmed'])
                ->where('time', '<', $end->format('H:i:s'))
                ->where(function ($q) use ($validated): void {
                    $q->whereNull('end_time')->orWhere('end_time', '>', $validated['time'].':00');
                })->lockForUpdate()->exists();

            if ($conflict) {
                return null;
            }

            $booking = Booking::create([
                ...$validated,
                'customer_id' => $customer->id,
                'end_time' => $end->format('H:i:s'),
                'status' => 'pending',
                'custom_fields' => $customFields,
            ]);
            $redeemedPoints = 0;
            if ($redeemLoyalty) {
                abort_unless($provider->loyalty_enabled, 422, 'This provider has not enabled loyalty rewards.');
                $redeemedPoints = (int) ($provider->loyalty_points_required ?? 0);
                abort_unless($redeemedPoints > 0, 422, 'This provider has not set a valid loyalty redemption threshold.');
                $loyalty = \App\Models\Loyalty::lockForUpdate()->firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $customer->id]);
                abort_unless($loyalty->points >= $redeemedPoints, 422, 'You do not have enough loyalty points for this provider.');
                $loyalty->decrement('points', $redeemedPoints);
                \App\Models\LoyaltyTransaction::create(['loyalty_id' => $loyalty->id, 'booking_id' => $booking->id, 'points' => -$redeemedPoints, 'reason' => 'Redeemed for booking request']);
            }

            Payment::create([
                'booking_id' => $booking->id,
                'provider_id' => $provider->id,
                'amount' => $redeemLoyalty ? 0 : $service->price,
                'currency' => $service->currency ?? $provider->default_currency ?? config('currencies.default', 'NGN'),
                'status' => $redeemLoyalty ? 'paid' : 'pending',
                'paid_at' => $redeemLoyalty ? now() : null,
                'gateway' => $redeemLoyalty ? 'loyalty' : null,
                'metadata' => ['payment_token' => Str::random(48), 'redeemed_loyalty_points' => $redeemedPoints],
            ]);

            return $booking;
        });

        if (! $booking) {
            return response()->json(['message' => 'That time has just been booked. Please choose another time.'], 409);
        }

        $booking->load(['provider.user', 'customer', 'service', 'payment']);
        $provider->user->notify(new BookingStatusNotification($booking, "{$customer->name} requested a new booking."));
        $customer->notify(new PlatformUpdateNotification(
            'Booking request received',
            "Your booking request for {$booking->service->name} with {$provider->user->name} has been received.",
            'View bookings',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/customer/bookings',
            ['booking_id' => $booking->id, 'provider_id' => $provider->id],
        ));
        User::where('role', 'admin')->where('is_active', true)->get()->each->notify(new PlatformUpdateNotification(
            'New booking request',
            "{$customer->name} requested {$booking->service->name} with {$provider->user->name}.",
            'View activity',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/activity?type=bookings',
            ['booking_id' => $booking->id, 'provider_id' => $provider->id],
        ));
        $this->notifyProviderOnWhatsApp($booking);

        return $this->success($booking, 'Booking request sent to the provider.', 201);
    }

    private function notifyProviderOnWhatsApp(Booking $booking): void
    {
        $booking->loadMissing(['provider.user', 'customer', 'service', 'payment']);
        $provider = $booking->provider;

        if (AppSetting::getValue('features.provider_whatsapp_notifications', '0') !== '1'
            || ! $provider?->whatsapp_notifications_enabled
            || blank($provider->whatsapp_number)) {
            return;
        }

        $amount = $booking->payment
            ? $booking->payment->currency.' '.number_format((float) $booking->payment->amount, 2)
            : 'Not available';
        $notes = filled($booking->notes) ? $booking->notes : 'None';
        $customAnswers = collect($booking->custom_fields ?? [])
            ->filter(fn ($field) => filled($field['label'] ?? null))
            ->map(function ($field): string {
                $answer = $field['answer'] ?? 'No answer';
                if (($field['type'] ?? null) === 'checkbox') {
                    $answer = $answer ? 'Yes' : 'No';
                }

                return "- {$field['label']}: {$answer}";
            })
            ->implode("\n");

        $body = implode("\n", array_filter([
            'New booking on BeautyPro HQ',
            '',
            'Customer: '.$booking->customer?->name,
            'Email: '.$booking->customer?->email,
            'Phone: '.($booking->customer?->phone ?: 'Not provided'),
            'Service: '.$booking->service?->name,
            'Date: '.optional($booking->date)->format('M j, Y'),
            'Time: '.substr((string) $booking->time, 0, 5),
            'Amount: '.$amount,
            'Status: '.ucfirst((string) $booking->status),
            'Notes: '.$notes,
            $customAnswers ? "\nExtra answers:\n{$customAnswers}" : null,
            '',
            'Open dashboard: '.rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/bookings',
        ], fn ($line) => $line !== null));

        app(TwilioWhatsAppService::class)->send($provider->whatsapp_number, $body);
    }

    private function validatedCustomBookingFields(ProviderProfile $provider, array $answers): array
    {
        $fields = collect($provider->booking_form_fields ?? [])
            ->filter(fn ($field) => filled($field['label'] ?? null))
            ->values()
            ->take(8);

        $clean = [];
        foreach ($fields as $index => $field) {
            $key = 'field_'.$index;
            $label = trim((string) ($field['label'] ?? 'Question '.($index + 1)));
            $type = in_array($field['type'] ?? 'text', ['text', 'textarea', 'select', 'checkbox'], true) ? $field['type'] : 'text';
            $required = (bool) ($field['required'] ?? false);
            $value = $answers[$key] ?? null;

            if ($type === 'checkbox') {
                $value = filter_var($value, FILTER_VALIDATE_BOOL);
            } elseif (is_array($value)) {
                $value = '';
            } else {
                $value = trim((string) $value);
            }

            if ($required && ($type === 'checkbox' ? ! $value : $value === '')) {
                abort(422, "{$label} is required.");
            }

            if ($type === 'select') {
                $options = collect($field['options'] ?? [])->map(fn ($option) => trim((string) $option))->filter()->values()->all();
                if ($value !== '' && ! in_array($value, $options, true)) {
                    abort(422, "{$label} has an invalid answer.");
                }
            }

            if ($type !== 'checkbox') {
                $value = Str::limit($value, $type === 'textarea' ? 1000 : 255, '');
            }

            $clean[] = [
                'label' => $label,
                'type' => $type,
                'answer' => $value,
            ];
        }

        return $clean;
    }

    public function checkoutPayment(Request $request, Payment $payment): JsonResponse
    {
        $validated = $request->validate([
            'gateway' => ['nullable', 'string', 'in:paystack,stripe,paypal'],
            'payment_token' => ['nullable', 'string'],
        ]);

        $this->authorizePaymentAccess($request, $payment, $validated['payment_token'] ?? null);
        abort_unless(in_array($payment->status, ['pending', 'failed', 'processing'], true), 422, 'This payment can no longer be checked out.');

        $payment->loadMissing(['booking.customer', 'booking.service', 'provider.paymentAccounts']);
        abort_unless((int) $payment->provider_id === (int) $payment->booking->provider_id, 422, 'Payment provider mismatch.');

        $gateway = $validated['gateway'] ?? $this->preferredProviderGateway($payment);
        $account = $payment->provider->paymentAccounts
            ->first(fn ($item) => $item->gateway === $gateway && ($item->enabled || $item->is_connected));

        abort_unless($account, 422, "This provider has not connected {$gateway} payments yet.");
        abort_unless((int) $account->provider_id === (int) $payment->provider_id, 422, 'Payment account provider mismatch.');

        $reference = 'BPHQ-BOOK-'.$payment->id.'-'.$payment->provider_id.'-'.Str::upper(Str::random(10));
        $metadata = [
            ...($payment->metadata ?? []),
            'type' => 'booking_payment',
            'payment_id' => $payment->id,
            'booking_id' => $payment->booking_id,
            'provider_id' => $payment->provider_id,
            'customer_id' => $payment->booking->customer_id,
            'provider_payment_account_id' => $account->id,
            'provider_account_reference' => $account->public_key ?: $account->account_reference,
            'gateway' => $gateway,
        ];

        if ($gateway === 'paystack') {
            $checkout = $this->initializePaystackBookingCheckout($payment, $account, $reference, $metadata);
        } elseif ($gateway === 'stripe') {
            $checkout = $this->initializeStripeBookingCheckout($payment, $account, $reference, $metadata);
        } else {
            $checkout = $this->initializePaypalBookingCheckout($payment, $account, $reference, $metadata);
        }

        $payment->update([
            'gateway' => $gateway,
            'reference' => $reference,
            'status' => 'processing',
            'metadata' => [
                ...$metadata,
                ...$checkout['metadata'],
            ],
        ]);

        return $this->success([
            'gateway' => $gateway,
            'reference' => $reference,
            'authorization_url' => $checkout['authorization_url'],
        ], 'Payment checkout created.');
    }

    public function verifyPayment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'reference' => ['required_without:session_id', 'nullable', 'string'],
            'session_id' => ['required_without:reference', 'nullable', 'string'],
            'payment_token' => ['nullable', 'string'],
        ]);

        $payment = Payment::query()
            ->when($validated['reference'] ?? null, fn ($query, $reference) => $query->where('reference', $reference))
            ->when(! ($validated['reference'] ?? null) && ($validated['session_id'] ?? null), fn ($query, $session) => $query->where('metadata->stripe_session_id', $session))
            ->with(['booking.customer', 'booking.service', 'provider.paymentAccounts'])
            ->firstOrFail();

        $this->authorizePaymentAccess($request, $payment, $validated['payment_token'] ?? null);
        abort_unless((int) $payment->provider_id === (int) $payment->booking->provider_id, 422, 'Payment provider mismatch.');

        if ($payment->gateway === 'paystack') {
            $this->verifyPaystackBookingPayment($payment);
        } elseif ($payment->gateway === 'stripe') {
            $this->verifyStripeBookingPayment($payment, $validated['session_id'] ?? null);
        } elseif ($payment->gateway === 'paypal') {
            $this->verifyPaypalBookingPayment($payment, $validated['session_id'] ?? null);
        } else {
            abort(422, 'Unknown payment gateway.');
        }

        $payment->refresh()->load(['booking.service', 'provider.user:id,name']);

        return $this->success($payment, 'Payment verified.');
    }

    private function authorizePaymentAccess(Request $request, Payment $payment, ?string $token): void
    {
        $payment->loadMissing(['booking.customer']);
        $storedToken = $payment->metadata['payment_token'] ?? null;
        if ($token && $storedToken && hash_equals($storedToken, $token)) {
            return;
        }

        $user = $request->user();
        abort_unless($user && ((int) $payment->booking->customer_id === (int) $user->id || $user->isAdmin()), 403);
    }

    private function preferredProviderGateway(Payment $payment): string
    {
        $preferred = $payment->provider->default_payment_gateway;
        if (in_array($preferred, ['paystack', 'stripe', 'paypal'], true)) {
            $account = $payment->provider->paymentAccounts
                ->first(fn ($item) => $item->gateway === $preferred && ($item->enabled || $item->is_connected));
            if ($account) {
                return $preferred;
            }
        }

        foreach (['paystack', 'stripe', 'paypal'] as $gateway) {
            $account = $payment->provider->paymentAccounts
                ->first(fn ($item) => $item->gateway === $gateway && ($item->enabled || $item->is_connected));
            if ($account) {
                return $gateway;
            }
        }

        abort(422, 'This provider has not connected a payment gateway yet.');
    }

    private function initializePaystackBookingCheckout(Payment $payment, $account, string $reference, array $metadata): array
    {
        $secret = $this->providerPaystackSecretKey($account);
        abort_unless($secret, 422, 'This provider has not added a Paystack secret key.');
        abort_unless($account->public_key, 422, 'This provider has not added a Paystack public key.');

        $response = Http::withToken($secret)->post('https://api.paystack.co/transaction/initialize', [
            'email' => $payment->booking->customer->email,
            'amount' => (int) round((float) $payment->amount * 100),
            'currency' => $payment->currency,
            'reference' => $reference,
            'callback_url' => rtrim(config('app.frontend_url', config('app.url')), '/').'/booking-confirmation?reference='.$reference.'&payment_token='.($payment->metadata['payment_token'] ?? ''),
            'metadata' => $metadata,
        ]);

        abort_unless($response->successful() && $response->json('status'), 422, $response->json('message') ?: 'Paystack checkout could not be created.');

        return [
            'authorization_url' => $response->json('data.authorization_url'),
            'metadata' => [
                'access_code' => $response->json('data.access_code'),
                'checkout_created_at' => now()->toIso8601String(),
            ],
        ];
    }

    private function initializeStripeBookingCheckout(Payment $payment, $account, string $reference, array $metadata): array
    {
        $secret = $this->providerStripeSecretKey($account);
        abort_unless($secret, 422, 'This provider has not added a Stripe secret key.');
        abort_unless($account->public_key, 422, 'This provider has not added a Stripe public key.');

        $serviceName = $payment->booking->service->name ?? 'BeautyPro HQ booking';
        $response = Http::withToken($secret)->asForm()->post('https://api.stripe.com/v1/checkout/sessions', [
            'mode' => 'payment',
            'client_reference_id' => $reference,
            'customer_email' => $payment->booking->customer->email,
            'success_url' => rtrim(config('app.frontend_url', config('app.url')), '/').'/booking-confirmation?reference='.$reference.'&session_id={CHECKOUT_SESSION_ID}&payment_token='.($payment->metadata['payment_token'] ?? ''),
            'cancel_url' => rtrim(config('app.frontend_url', config('app.url')), '/').'/booking-confirmation?reference='.$reference.'&payment_token='.($payment->metadata['payment_token'] ?? '').'&cancelled=1',
            'line_items[0][quantity]' => 1,
            'line_items[0][price_data][currency]' => strtolower($payment->currency),
            'line_items[0][price_data][unit_amount]' => (int) round((float) $payment->amount * 100),
            'line_items[0][price_data][product_data][name]' => $serviceName,
            'metadata[type]' => $metadata['type'],
            'metadata[payment_id]' => $metadata['payment_id'],
            'metadata[booking_id]' => $metadata['booking_id'],
            'metadata[provider_id]' => $metadata['provider_id'],
            'metadata[customer_id]' => $metadata['customer_id'],
            'metadata[provider_payment_account_id]' => $metadata['provider_payment_account_id'],
            'metadata[provider_account_reference]' => $metadata['provider_account_reference'],
            'payment_intent_data[metadata][type]' => $metadata['type'],
            'payment_intent_data[metadata][payment_id]' => $metadata['payment_id'],
            'payment_intent_data[metadata][booking_id]' => $metadata['booking_id'],
            'payment_intent_data[metadata][provider_id]' => $metadata['provider_id'],
            'payment_intent_data[metadata][provider_payment_account_id]' => $metadata['provider_payment_account_id'],
        ]);

        abort_unless($response->successful(), 422, $response->json('error.message') ?: 'Stripe checkout could not be created.');

        return [
            'authorization_url' => $response->json('url'),
            'metadata' => [
                'stripe_session_id' => $response->json('id'),
                'checkout_created_at' => now()->toIso8601String(),
            ],
        ];
    }

    private function initializePaypalBookingCheckout(Payment $payment, $account, string $reference, array $metadata): array
    {
        $accessToken = $this->paypalAccessToken($account);
        abort_unless($accessToken, 422, 'This provider PayPal account cannot create orders.');

        $baseUrl = $this->paypalBaseUrl($account);
        $response = Http::withToken($accessToken)->post($baseUrl.'/v2/checkout/orders', [
            'intent' => 'CAPTURE',
            'purchase_units' => [[
                'reference_id' => $reference,
                'custom_id' => $reference,
                'description' => $payment->booking->service->name ?? 'BeautyPro HQ booking',
                'amount' => [
                    'currency_code' => strtoupper($payment->currency),
                    'value' => number_format((float) $payment->amount, 2, '.', ''),
                ],
            ]],
            'payment_source' => [
                'paypal' => [
                    'experience_context' => [
                        'return_url' => rtrim(config('app.frontend_url', config('app.url')), '/').'/booking-confirmation?reference='.$reference.'&payment_token='.($payment->metadata['payment_token'] ?? ''),
                        'cancel_url' => rtrim(config('app.frontend_url', config('app.url')), '/').'/booking-confirmation?reference='.$reference.'&payment_token='.($payment->metadata['payment_token'] ?? '').'&cancelled=1',
                    ],
                ],
            ],
        ]);

        abort_unless($response->successful(), 422, $response->json('message') ?: data_get($response->json(), 'details.0.description') ?: 'PayPal order could not be created.');

        $data = $response->json();
        $approvalUrl = collect($data['links'] ?? [])->firstWhere('rel', 'approve')['href'] ?? null;
        abort_unless($approvalUrl, 422, 'PayPal approval URL was not returned.');

        return [
            'authorization_url' => $approvalUrl,
            'metadata' => [
                'paypal_order_id' => $data['id'] ?? null,
                'checkout_created_at' => now()->toIso8601String(),
            ],
        ];
    }

    private function verifyPaystackBookingPayment(Payment $payment): void
    {
        $account = $payment->provider->paymentAccounts
            ->first(fn ($item) => (int) $item->id === (int) ($payment->metadata['provider_payment_account_id'] ?? 0) && $item->gateway === 'paystack');
        abort_unless($account, 422, 'Provider Paystack account not found.');

        $secret = $this->providerPaystackSecretKey($account);
        abort_unless($secret, 422, 'This provider Paystack account cannot verify payments.');

        $response = Http::withToken($secret)->get('https://api.paystack.co/transaction/verify/'.rawurlencode($payment->reference));
        abort_unless($response->successful() && $response->json('status'), 422, $response->json('message') ?: 'Paystack payment could not be verified.');

        $data = $response->json('data');
        $meta = $data['metadata'] ?? [];
        $this->assertVerifiedPaymentPayload($payment, $meta, (int) ($data['amount'] ?? 0), strtoupper((string) ($data['currency'] ?? '')));
        abort_unless(($data['status'] ?? null) === 'success', 422, 'Payment has not succeeded yet.');

        DB::transaction(function () use ($payment, $data): void {
            $payment->update([
                'status' => 'paid',
                'paid_at' => now(),
                'metadata' => [
                    ...($payment->metadata ?? []),
                    'verified_at' => now()->toIso8601String(),
                    'gateway_response' => $data,
                ],
            ]);
        });
        $this->notifyBookingPaymentPaid($payment);
    }

    private function verifyStripeBookingPayment(Payment $payment, ?string $sessionId): void
    {
        $account = $payment->provider->paymentAccounts
            ->first(fn ($item) => (int) $item->id === (int) ($payment->metadata['provider_payment_account_id'] ?? 0) && $item->gateway === 'stripe');
        abort_unless($account, 422, 'Provider Stripe account not found.');

        $secret = $this->providerStripeSecretKey($account);
        abort_unless($secret, 422, 'This provider Stripe account cannot verify payments.');

        $sessionId ??= $payment->metadata['stripe_session_id'] ?? null;
        abort_unless($sessionId, 422, 'Stripe session is missing.');

        $response = Http::withToken($secret)->get('https://api.stripe.com/v1/checkout/sessions/'.rawurlencode($sessionId), [
            'expand' => ['payment_intent'],
        ]);
        abort_unless($response->successful(), 422, $response->json('error.message') ?: 'Stripe payment could not be verified.');

        $data = $response->json();
        $meta = $data['metadata'] ?? [];
        $this->assertVerifiedPaymentPayload($payment, $meta, (int) ($data['amount_total'] ?? 0), strtoupper((string) ($data['currency'] ?? '')));
        abort_unless(($data['payment_status'] ?? null) === 'paid', 422, 'Payment has not succeeded yet.');
        abort_unless(($data['client_reference_id'] ?? null) === $payment->reference, 422, 'Stripe reference mismatch.');

        DB::transaction(function () use ($payment, $data): void {
            $payment->update([
                'status' => 'paid',
                'paid_at' => now(),
                'metadata' => [
                    ...($payment->metadata ?? []),
                    'verified_at' => now()->toIso8601String(),
                    'gateway_response' => $data,
                ],
            ]);
        });
        $this->notifyBookingPaymentPaid($payment);
    }

    private function verifyPaypalBookingPayment(Payment $payment, ?string $orderId): void
    {
        $account = $payment->provider->paymentAccounts
            ->first(fn ($item) => (int) $item->id === (int) ($payment->metadata['provider_payment_account_id'] ?? 0) && $item->gateway === 'paypal');
        abort_unless($account, 422, 'Provider PayPal account not found.');

        $accessToken = $this->paypalAccessToken($account);
        abort_unless($accessToken, 422, 'This provider PayPal account cannot verify payments.');

        $orderId ??= $payment->metadata['paypal_order_id'] ?? null;
        abort_unless($orderId, 422, 'PayPal order is missing.');

        $baseUrl = $this->paypalBaseUrl($account);
        $capture = Http::withToken($accessToken)->withHeaders([
            'PayPal-Request-Id' => $payment->reference,
        ])->post($baseUrl.'/v2/checkout/orders/'.rawurlencode($orderId).'/capture');

        if (! $capture->successful() && $capture->status() === 422) {
            $details = Http::withToken($accessToken)->get($baseUrl.'/v2/checkout/orders/'.rawurlencode($orderId));
            abort_unless($details->successful(), 422, $capture->json('message') ?: 'PayPal payment could not be captured.');
            $data = $details->json();
        } else {
            abort_unless($capture->successful(), 422, $capture->json('message') ?: data_get($capture->json(), 'details.0.description') ?: 'PayPal payment could not be captured.');
            $data = $capture->json();
        }

        abort_unless(($data['status'] ?? null) === 'COMPLETED', 422, 'PayPal payment has not completed yet.');
        $purchaseUnit = $data['purchase_units'][0] ?? [];
        abort_unless(($purchaseUnit['reference_id'] ?? null) === $payment->reference || ($purchaseUnit['custom_id'] ?? null) === $payment->reference, 422, 'PayPal reference mismatch.');

        $amount = data_get($purchaseUnit, 'payments.captures.0.amount.value') ?? data_get($purchaseUnit, 'amount.value');
        $currency = data_get($purchaseUnit, 'payments.captures.0.amount.currency_code') ?? data_get($purchaseUnit, 'amount.currency_code');
        abort_unless((float) $amount === (float) number_format((float) $payment->amount, 2, '.', ''), 422, 'Payment amount mismatch.');
        abort_unless(strtoupper((string) $payment->currency) === strtoupper((string) $currency), 422, 'Payment currency mismatch.');

        DB::transaction(function () use ($payment, $data): void {
            $payment->update([
                'status' => 'paid',
                'paid_at' => now(),
                'metadata' => [
                    ...($payment->metadata ?? []),
                    'verified_at' => now()->toIso8601String(),
                    'gateway_response' => $data,
                ],
            ]);
        });
        $this->notifyBookingPaymentPaid($payment);
    }

    private function notifyBookingPaymentPaid(Payment $payment): void
    {
        $payment->refresh()->loadMissing(['booking.customer', 'booking.service', 'provider.user']);
        $providerName = $payment->provider?->user?->name ?? 'your provider';
        $serviceName = $payment->booking?->service?->name ?? 'booking';
        $amount = $payment->currency.' '.number_format((float) $payment->amount, 2);

        $payment->booking?->customer?->notify(new PlatformUpdateNotification(
            'Booking payment confirmed',
            "Your {$amount} payment for {$serviceName} with {$providerName} has been confirmed.",
            'View bookings',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/customer/bookings',
            ['booking_id' => $payment->booking_id, 'payment_id' => $payment->id],
        ));

        $payment->provider?->user?->notify(new PlatformUpdateNotification(
            'New booking payment received',
            "{$payment->booking?->customer?->name} paid {$amount} for {$serviceName}.",
            'View payments',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/payments',
            ['booking_id' => $payment->booking_id, 'payment_id' => $payment->id],
        ));

        User::where('role', 'admin')->where('is_active', true)->get()->each->notify(new PlatformUpdateNotification(
            'Booking payment confirmed',
            "{$payment->booking?->customer?->name} paid {$amount} to {$providerName} for {$serviceName}.",
            'View activity',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/activity?type=payments',
            ['booking_id' => $payment->booking_id, 'payment_id' => $payment->id, 'provider_id' => $payment->provider_id],
        ));
    }

    private function assertVerifiedPaymentPayload(Payment $payment, array $meta, int $amountMinor, string $currency): void
    {
        $localMeta = $payment->metadata ?? [];
        abort_unless((int) round((float) $payment->amount * 100) === $amountMinor, 422, 'Payment amount mismatch.');
        abort_unless(strtoupper((string) $payment->currency) === $currency, 422, 'Payment currency mismatch.');
        abort_unless((int) ($meta['payment_id'] ?? 0) === (int) $payment->id, 422, 'Payment ID mismatch.');
        abort_unless((int) ($meta['booking_id'] ?? 0) === (int) $payment->booking_id, 422, 'Booking ID mismatch.');
        abort_unless((int) ($meta['provider_id'] ?? 0) === (int) $payment->provider_id, 422, 'Provider ID mismatch.');
        abort_unless((int) ($meta['provider_payment_account_id'] ?? 0) === (int) ($localMeta['provider_payment_account_id'] ?? 0), 422, 'Provider payment account mismatch.');
        abort_unless(($meta['provider_account_reference'] ?? null) === ($localMeta['provider_account_reference'] ?? null), 422, 'Provider destination account mismatch.');
    }

    private function providerPaystackSecretKey($account): ?string
    {
        $settings = $account->settings ?? [];
        $key = $settings['secret_key'] ?? null;

        return is_string($key) && $key !== '' ? $key : null;
    }

    private function providerStripeSecretKey($account): ?string
    {
        $settings = $account->settings ?? [];
        $key = $settings['secret_key'] ?? null;

        return is_string($key) && $key !== '' ? $key : null;
    }

    private function paypalAccessToken($account): ?string
    {
        $settings = $account->settings ?? [];
        $clientId = $account->public_key ?: ($settings['client_id'] ?? null);
        $secret = $settings['secret_key'] ?? null;
        if (! is_string($clientId) || $clientId === '' || ! is_string($secret) || $secret === '') {
            return null;
        }

        $response = Http::withBasicAuth($clientId, $secret)
            ->asForm()
            ->post($this->paypalBaseUrl($account).'/v1/oauth2/token', [
                'grant_type' => 'client_credentials',
            ]);

        return $response->successful() ? $response->json('access_token') : null;
    }

    private function paypalBaseUrl($account): string
    {
        return 'https://api-m.paypal.com';
    }

    public function show(Request $request, Booking $booking): JsonResponse
    {
        abort_unless($booking->customer_id === $request->user()->id || $request->user()->isAdmin(), 403);

        return $this->success($booking->load(['provider.user:id,name', 'customer:id,name,email', 'service', 'payment', 'review']));
    }

    public function cancel(Request $request, Booking $booking): JsonResponse
    {
        abort_unless($booking->customer_id === $request->user()->id, 403);
        abort_unless(in_array($booking->status, ['pending', 'confirmed'], true), 422, 'Only pending or confirmed bookings can be cancelled.');

        $booking->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        $booking->load(['provider.user', 'customer', 'service']);
        $booking->provider->user->notify(new BookingStatusNotification($booking, "{$booking->customer->name} cancelled a booking."));

        return $this->success($booking, 'Booking cancelled.');
    }

    public function review(Request $request, ProviderProfile $provider): JsonResponse
    {
        $validated = $request->validate([
            'booking_id' => ['nullable', 'integer', 'exists:bookings,id'],
            'rating' => ['required', 'integer', 'between:1,5'],
            'comment' => ['nullable', 'string', 'max:3000'],
        ]);

        $bookingQuery = Booking::where('customer_id', $request->user()->id)
            ->where('provider_id', $provider->id)->where('status', 'completed')->whereDoesntHave('review');
        $booking = isset($validated['booking_id']) ? $bookingQuery->whereKey($validated['booking_id'])->firstOrFail() : $bookingQuery->latest('date')->firstOrFail();

        $review = Review::create([
            'booking_id' => $booking->id,
            'provider_id' => $provider->id,
            'customer_id' => $request->user()->id,
            'rating' => $validated['rating'],
            'comment' => $validated['comment'] ?? null,
        ]);

        return $this->success($review->load('customer:id,name'), 'Thank you for your review.', 201);
    }
}
