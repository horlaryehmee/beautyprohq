<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Models\LiveChatConversation;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\Service;
use App\Models\User;
use App\Notifications\BookingStatusNotification;
use App\Notifications\PlatformUpdateNotification;
use App\Services\GoogleCalendarService;
use App\Services\TwilioWhatsAppService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

class BookingController extends Controller
{
    private const PAYSTACK_BOOKING_CURRENCIES = ['NGN', 'USD'];

    public function providerPaystackWebhook(Request $request, PaymentAccount $paymentAccount, string $token): JsonResponse
    {
        abort_unless($paymentAccount->gateway === 'paystack', 404);
        $settings = $paymentAccount->settings ?? [];
        abort_unless(hash_equals((string) ($settings['webhook_token'] ?? ''), $token), 404);

        $secret = $this->providerPaystackSecretKey($paymentAccount);
        abort_unless($secret, 422, 'Provider Paystack secret key is not configured.');

        $signature = (string) $request->header('X-Paystack-Signature');
        abort_unless(hash_equals(hash_hmac('sha512', $request->getContent(), $secret), $signature), 401, 'Invalid Paystack signature.');

        if ($request->input('event') !== 'charge.success') {
            return response()->json(['ok' => true]);
        }

        $data = (array) $request->input('data', []);
        $metadata = (array) ($data['metadata'] ?? []);
        if (($metadata['type'] ?? null) !== 'booking_payment') {
            return response()->json(['ok' => true]);
        }

        $payment = Payment::with(['booking.customer', 'booking.service', 'provider.paymentAccounts'])
            ->where('reference', (string) ($data['reference'] ?? ''))
            ->first();

        if (! $payment || (int) ($metadata['provider_payment_account_id'] ?? 0) !== (int) $paymentAccount->id) {
            return response()->json(['ok' => true]);
        }

        $this->assertVerifiedPaymentPayload($payment, $metadata, (int) ($data['amount'] ?? 0), strtoupper((string) ($data['currency'] ?? '')));

        if (($data['status'] ?? null) === 'success' && $this->markBookingPaymentPaid($payment, $data)) {
            $this->safeNotifyBookingPaymentPaid($payment);
        }

        return response()->json(['ok' => true]);
    }

    public function index(Request $request): JsonResponse
    {
        $bookings = Booking::where('customer_id', $request->user()->id)
            ->with(['provider.user:id,name', 'service', 'payment', 'review'])
            ->when($request->status, fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('date')->orderByDesc('time')->paginate($this->perPage($request, 15, 50));

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
            'referral_code' => ['nullable', 'string', 'max:60'],
            'payment_method' => ['nullable', 'string', 'in:paystack,stripe,paypal,manual'],
            'customer' => ['nullable', 'array'],
            'customer.name' => ['nullable', 'string', 'max:120'],
            'customer.email' => ['nullable', 'email:rfc', 'max:255'],
            'customer.phone' => ['nullable', 'string', 'max:40'],
        ]);

        $customerDetails = $validated['customer'] ?? [];
        $request->user()->update(array_filter([
            'name' => $customerDetails['name'] ?? null,
            'phone' => $customerDetails['phone'] ?? null,
        ], fn ($value) => filled($value)));
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
            'referral_code' => ['nullable', 'string', 'max:60'],
            'payment_method' => ['nullable', 'string', 'in:paystack,stripe,paypal,manual'],
            'customer.name' => ['required', 'string', 'max:120'],
            'customer.email' => ['required', 'email:rfc', 'max:255'],
            'customer.phone' => ['required', 'string', 'max:40'],
            'customer.create_account' => ['nullable', 'boolean'],
            'customer.password' => ['nullable', 'required_if:customer.create_account,true', 'string', 'min:8', 'max:255', 'confirmed'],
            'customer.password_confirmation' => ['nullable', 'required_if:customer.create_account,true', 'string', 'max:255'],
        ]);

        $email = Str::lower(trim($validated['customer']['email']));
        $createAccount = (bool) ($validated['customer']['create_account'] ?? false);
        $customer = User::where('email', $email)->first();
        if ($customer && ! $customer->isCustomer()) {
            return response()->json(['message' => 'Please use a customer email address for this booking.'], 422);
        }
        if ($customer && ! $customer->is_guest) {
            return response()->json(['message' => 'An account already exists with this email. Please log in before booking.'], 422);
        }
        if ($customer && ! $createAccount) {
            return response()->json(['message' => 'This email already has a guest booking. Create and verify the account before making another booking.'], 422);
        }

        $customer ??= User::create([
            'name' => $validated['customer']['name'],
            'email' => $email,
            'phone' => $validated['customer']['phone'] ?? null,
            'password' => Hash::make($createAccount ? $validated['customer']['password'] : Str::random(32)),
            'role' => 'customer',
            'is_guest' => ! $createAccount,
            'preferred_currency' => config('currencies.default', 'NGN'),
        ]);
        if ($customer->is_guest && $createAccount) {
            $customer->update([
                'name' => $validated['customer']['name'],
                'phone' => $validated['customer']['phone'] ?? $customer->phone,
                'password' => Hash::make($validated['customer']['password']),
                'is_guest' => false,
                'email_verified_at' => null,
            ]);
        }

        if (! $customer->phone && ! empty($validated['customer']['phone'])) {
            $customer->update(['phone' => $validated['customer']['phone']]);
        }

        unset($validated['customer']);

        $response = $this->createBooking($request, $validated, $customer);

        if ($createAccount && ! $customer->hasVerifiedEmail() && $response->isSuccessful()) {
            try {
                $customer->sendEmailVerificationNotification();
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        return $response;
    }

    private function createBooking(Request $request, array $validated, User $customer): JsonResponse
    {
        $provider = ProviderProfile::directory()->findOrFail($validated['provider_id']);
        if (! $provider->user->hasPaidPlan()) {
            return response()->json(['message' => 'This provider is not accepting direct bookings on BeautyPro HQ.'], 422);
        }
        $service = Service::whereKey($validated['service_id'])->where('provider_id', $provider->id)->where('is_active', true)->firstOrFail();
        $customFields = $this->validatedCustomBookingFields($provider, $validated['custom_fields'] ?? []);
        $referrerId = $this->referrerIdFromCode($provider, $customer, $validated['referral_code'] ?? null);
        $redeemLoyalty = (bool) ($validated['redeem_loyalty'] ?? false);
        $paymentMethod = $redeemLoyalty ? 'loyalty' : $this->selectedPaymentMethod($provider, $validated['payment_method'] ?? null);
        unset($validated['custom_fields']);
        unset($validated['redeem_loyalty']);
        unset($validated['referral_code']);
        unset($validated['payment_method']);
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

        $booking = DB::transaction(function () use ($provider, $service, $customer, $validated, $end, $customFields, $referrerId, $redeemLoyalty, $paymentMethod): ?Booking {
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
                'referred_by_customer_id' => $referrerId,
            ]);
            $redeemedPoints = 0;
            if ($redeemLoyalty) {
                abort_unless($provider->loyalty_enabled, 422, 'This provider has not enabled loyalty rewards.');
                $redeemedPoints = $this->requiredLoyaltyPointsForService($provider, $service);
                $loyalty = Loyalty::lockForUpdate()->firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $customer->id]);
                abort_unless($loyalty->points >= $redeemedPoints, 422, 'You do not have enough loyalty points for this provider.');
                $loyalty->decrement('points', $redeemedPoints);
                LoyaltyTransaction::create(['loyalty_id' => $loyalty->id, 'booking_id' => $booking->id, 'points' => -$redeemedPoints, 'reason' => 'Redeemed for booking request']);
            }

            Payment::create([
                'booking_id' => $booking->id,
                'provider_id' => $provider->id,
                'amount' => $redeemLoyalty ? 0 : $service->price,
                'currency' => $service->currency ?? $provider->default_currency ?? config('currencies.default', 'NGN'),
                'status' => $redeemLoyalty ? 'paid' : 'pending',
                'paid_at' => $redeemLoyalty ? now() : null,
                'gateway' => $paymentMethod === 'loyalty' ? 'loyalty' : ($paymentMethod === 'manual' ? 'manual' : null),
                'reference' => $paymentMethod === 'manual' ? 'BPHQ-MANUAL-'.$booking->id.'-'.Str::upper(Str::random(8)) : null,
                'metadata' => ['payment_token' => Str::random(48), 'redeemed_loyalty_points' => $redeemedPoints, 'selected_gateway' => $paymentMethod],
            ]);

            LiveChatConversation::firstOrCreate(
                ['booking_id' => $booking->id],
                [
                    'provider_id' => $provider->id,
                    'customer_id' => $customer->id,
                    'visitor_name' => $customer->name,
                    'visitor_email' => $customer->email,
                    'visitor_token' => Str::random(64),
                    'status' => 'open',
                    'last_message_at' => now(),
                ],
            );

            return $booking;
        });

        if (! $booking) {
            return response()->json(['message' => 'That time has just been booked. Please choose another time.'], 409);
        }

        $booking->load(['provider.user', 'customer', 'service', 'payment']);
        if ($booking->payment?->gateway === 'manual') {
            $booking->setAttribute('manual_payment', $this->manualPaymentDetails($provider));
        }
        if ($booking->payment?->status === 'paid') {
            $this->safeNotifyBookingPaymentPaid($booking->payment);
        } else {
            app(GoogleCalendarService::class)->syncBookingSafely($booking);
            $this->safeNotify($booking->customer, new BookingStatusNotification(
                $booking,
                "Your booking request with {$provider->user->name} has been created. You will receive updates by email."
            ));
        }

        return $this->success($booking, 'Booking request created.', 201);
    }

    private function safeNotify(?User $user, object $notification): void
    {
        if (! $user) {
            return;
        }

        try {
            $user->notify($notification);
        } catch (\Throwable $exception) {
            Log::warning('Booking notification failed without blocking booking flow.', [
                'user_id' => $user->id,
                'notification' => $notification::class,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function selectedPaymentMethod(ProviderProfile $provider, ?string $requested): string
    {
        $methods = $this->connectedPaymentGateways($provider);
        if ($requested && in_array($requested, $methods, true)) {
            return $requested;
        }

        abort_if(! count($methods), 422, 'This provider has not connected a payment method yet.');

        return $methods[0];
    }

    private function requiredLoyaltyPointsForService(ProviderProfile $provider, Service $service): int
    {
        $minimumPoints = (int) ($provider->loyalty_points_required ?? 0);
        $rewardValue = (float) ($provider->loyalty_reward_value_amount ?? 0);
        abort_unless($minimumPoints > 0 && $rewardValue > 0, 422, 'This provider has not set a valid loyalty redemption value.');

        $servicePrice = max(0, (float) $service->price);
        if ($servicePrice <= 0) {
            return $minimumPoints;
        }

        return max($minimumPoints, (int) ceil(($servicePrice / $rewardValue) * $minimumPoints));
    }

    private function referrerIdFromCode(ProviderProfile $provider, User $customer, ?string $code): ?int
    {
        if (blank($code) || ! $provider->referral_rewards_enabled || (int) ($provider->loyalty_referral_points ?? 0) <= 0) {
            return null;
        }

        if (! preg_match('/^BPHQ-(\d+)-(\d+)$/i', trim($code), $matches)) {
            abort(422, 'This referral code is not valid.');
        }

        $providerId = (int) $matches[1];
        $referrerId = (int) $matches[2];
        abort_unless($providerId === (int) $provider->id, 422, 'This referral code is for another provider.');
        abort_unless($referrerId !== (int) $customer->id, 422, 'You cannot use your own referral code.');
        abort_unless(User::whereKey($referrerId)->where('role', 'customer')->exists(), 422, 'This referral code is not valid.');

        $hasCompletedBooking = Booking::where('provider_id', $provider->id)
            ->where('customer_id', $referrerId)
            ->where('status', 'completed')
            ->exists();
        abort_unless($hasCompletedBooking, 422, 'This referral code is not active yet.');

        return $referrerId;
    }

    private function connectedPaymentGateways(ProviderProfile $provider): array
    {
        $order = ['paystack' => 0, 'stripe' => 1, 'paypal' => 2, 'manual' => 3];

        return $provider->paymentAccounts()
            ->where(function ($query): void {
                $query->where('enabled', true)->orWhere('is_connected', true);
            })
            ->pluck('gateway')
            ->sortBy(fn ($gateway) => $order[$gateway] ?? 99)
            ->values()
            ->all();
    }

    private function manualPaymentDetails(ProviderProfile $provider): ?array
    {
        $account = $provider->paymentAccounts()
            ->where('gateway', 'manual')
            ->where(function ($query): void {
                $query->where('enabled', true)->orWhere('is_connected', true);
            })
            ->first();

        if (! $account) {
            return null;
        }

        return [
            'account_name' => $account->account_name,
            'account_reference' => $account->account_reference,
            'instructions' => $account->payment_instructions ?? $account->settings['instructions'] ?? null,
        ];
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
        $clean = [];
        if (isset($answers['_booking_timezone']) && is_string($answers['_booking_timezone'])) {
            $timezone = trim($answers['_booking_timezone']);
            if ($timezone !== '' && in_array($timezone, timezone_identifiers_list(), true)) {
                $clean[] = [
                    'label' => 'Customer timezone',
                    'type' => 'text',
                    'answer' => $timezone,
                ];
            }
        }

        foreach (array_values($provider->booking_form_fields ?? []) as $index => $field) {
            $key = '_field_'.$index;
            if (! array_key_exists($key, $answers)) {
                continue;
            }

            $value = $answers[$key];
            $type = $field['type'] ?? 'text';
            if ($type === 'checkbox') {
                $value = is_array($field['options'] ?? null) && count($field['options'])
                    ? array_values(array_intersect(array_map('strval', (array) $value), array_map('strval', $field['options'])))
                    : filter_var($value, FILTER_VALIDATE_BOOLEAN);
            } elseif (is_array($value)) {
                $value = implode(', ', array_map('strval', $value));
            } else {
                $value = trim((string) $value);
            }

            if ($type === 'select' && ! in_array($value, $field['options'] ?? [], true)) {
                abort(422, "Choose a valid option for: {$field['label']}");
            }
            if (($field['required'] ?? false) && ($value === '' || ($type === 'checkbox' && (is_array($value) ? ! count($value) : $value !== true)))) {
                abort(422, "Please answer: {$field['label']}");
            }
            if ($value !== '' && ($value !== false || $type === 'checkbox') && (! is_array($value) || count($value))) {
                $clean[] = [
                    'label' => $field['label'],
                    'type' => $type,
                    'answer' => $value,
                ];
            }
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
        abort_unless(in_array($gateway, ['paystack', 'stripe', 'paypal'], true), 422, 'Manual payments must be confirmed by the provider.');
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

        if ($payment->status === 'paid') {
            return $this->success($this->paymentConfirmationData($payment), 'Payment already verified.');
        }

        try {
            if ($payment->gateway === 'paystack') {
                $this->verifyPaystackBookingPayment($payment);
            } elseif ($payment->gateway === 'stripe') {
                $this->verifyStripeBookingPayment($payment, $validated['session_id'] ?? null);
            } elseif ($payment->gateway === 'paypal') {
                $this->verifyPaypalBookingPayment($payment, $validated['session_id'] ?? null);
            } else {
                abort(422, 'Unknown payment gateway.');
            }
        } catch (\Throwable $exception) {
            $payment->refresh();
            if ($payment->status !== 'paid') {
                Log::error('Booking payment verification failed.', [
                    'payment_id' => $payment->id,
                    'gateway' => $payment->gateway,
                    'reference' => $payment->reference,
                    'exception' => $exception::class,
                    'message' => $exception->getMessage(),
                ]);

                if ($exception instanceof HttpExceptionInterface) {
                    throw $exception;
                }

                return response()->json(['message' => 'The gateway confirmation is still being processed. Please wait a moment and try again.'], 503);
            }
        }

        $payment->refresh();
        abort_unless($payment->status === 'paid', 422, 'Payment has not succeeded yet.');

        return $this->success($this->paymentConfirmationData($payment), 'Payment verified.');
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
        $preferred = $payment->metadata['selected_gateway'] ?? null;
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
        $currency = strtoupper((string) $payment->currency);
        abort_unless(
            in_array($currency, self::PAYSTACK_BOOKING_CURRENCIES, true),
            422,
            'Paystack booking payments are available in NGN and USD only. Change the service pricing currency to continue.'
        );

        $response = Http::external()->withToken($secret)->post('https://api.paystack.co/transaction/initialize', [
            'email' => $payment->booking->customer->email,
            'amount' => (int) round((float) $payment->amount * 100),
            'currency' => $currency,
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
        $response = Http::external()->withToken($secret)->asForm()->post('https://api.stripe.com/v1/checkout/sessions', [
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
        $response = Http::external()->withToken($accessToken)->post($baseUrl.'/v2/checkout/orders', [
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

        $response = Http::external()->withToken($secret)->get('https://api.paystack.co/transaction/verify/'.rawurlencode($payment->reference));
        abort_unless($response->successful() && $response->json('status'), 422, $response->json('message') ?: 'Paystack payment could not be verified.');

        $data = $response->json('data');
        $meta = $data['metadata'] ?? [];
        $this->assertVerifiedPaymentPayload($payment, $meta, (int) ($data['amount'] ?? 0), strtoupper((string) ($data['currency'] ?? '')));
        abort_unless(($data['status'] ?? null) === 'success', 422, 'Payment has not succeeded yet.');

        if ($this->markBookingPaymentPaid($payment, $data)) {
            $this->safeNotifyBookingPaymentPaid($payment);
        }
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

        $response = Http::external()->withToken($secret)->get('https://api.stripe.com/v1/checkout/sessions/'.rawurlencode($sessionId), [
            'expand' => ['payment_intent'],
        ]);
        abort_unless($response->successful(), 422, $response->json('error.message') ?: 'Stripe payment could not be verified.');

        $data = $response->json();
        $meta = $data['metadata'] ?? [];
        $this->assertVerifiedPaymentPayload($payment, $meta, (int) ($data['amount_total'] ?? 0), strtoupper((string) ($data['currency'] ?? '')));
        abort_unless(($data['payment_status'] ?? null) === 'paid', 422, 'Payment has not succeeded yet.');
        abort_unless(($data['client_reference_id'] ?? null) === $payment->reference, 422, 'Stripe reference mismatch.');

        if ($this->markBookingPaymentPaid($payment, $data)) {
            $this->safeNotifyBookingPaymentPaid($payment);
        }
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
        $capture = Http::external()->withToken($accessToken)->withHeaders([
            'PayPal-Request-Id' => $payment->reference,
        ])->post($baseUrl.'/v2/checkout/orders/'.rawurlencode($orderId).'/capture');

        if (! $capture->successful() && $capture->status() === 422) {
            $details = Http::external()->withToken($accessToken)->get($baseUrl.'/v2/checkout/orders/'.rawurlencode($orderId));
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

        if ($this->markBookingPaymentPaid($payment, $data)) {
            $this->safeNotifyBookingPaymentPaid($payment);
        }
    }

    private function markBookingPaymentPaid(Payment $payment, array $gatewayResponse): bool
    {
        return DB::transaction(function () use ($payment, $gatewayResponse): bool {
            $locked = Payment::lockForUpdate()->findOrFail($payment->id);
            if ($locked->status === 'paid') {
                return false;
            }

            $locked->update([
                'status' => 'paid',
                'paid_at' => now(),
                'metadata' => [
                    ...($locked->metadata ?? []),
                    'verified_at' => now()->toIso8601String(),
                    'gateway_response' => $gatewayResponse,
                ],
            ]);
            $locked->booking()->whereIn('status', ['pending', 'confirmed'])->update(['status' => 'confirmed']);
            $payment->refresh();

            return true;
        });
    }

    private function notifyBookingPaymentPaid(Payment $payment): void
    {
        $payment->refresh()->loadMissing(['booking.customer', 'booking.service', 'provider.user']);
        if ($payment->status !== 'paid' || ($payment->metadata['booking_notifications_sent_at'] ?? null)) {
            return;
        }

        $booking = $payment->booking;
        if (! $booking) {
            return;
        }

        $booking->loadMissing(['provider.user', 'customer', 'service', 'payment']);
        $providerName = $payment->provider?->user?->name ?? 'your provider';
        $customerName = $booking->customer?->name ?? 'A customer';
        $serviceName = $booking->service?->name ?? 'booking';
        $amount = $payment->currency.' '.number_format((float) $payment->amount, 2);
        $details = [
            'Service' => $serviceName,
            'Provider' => $providerName,
            'Customer' => $customerName,
            'Customer email' => $booking->customer?->email,
            'Customer phone' => $booking->customer?->phone ?: 'Not provided',
            'Date' => $booking->date?->format('M j, Y'),
            'Time' => substr((string) $booking->time, 0, 5),
            'Amount' => $amount,
            'Payment method' => ucfirst((string) ($payment->gateway ?? 'gateway')),
            'Payment reference' => $payment->reference ?: 'Not available',
            'Booking status' => ucfirst((string) $booking->status),
            'Notes' => $booking->notes ?: 'None',
        ];

        $this->safeNotify($booking->customer, new PlatformUpdateNotification(
            'Booking confirmed',
            "Your {$amount} payment for {$serviceName} with {$providerName} has been confirmed.",
            'View bookings',
            rtrim(config('app.frontend_url', config('app.url')), '/').'/customer/bookings',
            ['booking_id' => $booking->id, 'payment_id' => $payment->id, 'details' => $details],
        ));

        $this->safeNotify($payment->provider?->user, new BookingStatusNotification(
            $booking,
            "{$customerName} paid {$amount} and requested a new booking."
        ));

        User::where('role', 'admin')->where('is_active', true)->get()->each(function (User $admin) use ($booking, $customerName, $providerName, $serviceName, $payment, $amount): void {
            $this->safeNotify($admin, new PlatformUpdateNotification(
                'New paid booking',
                "{$customerName} paid {$amount} to {$providerName} for {$serviceName}.",
                'View activity',
                rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/activity?type=bookings',
                ['booking_id' => $booking->id, 'payment_id' => $payment->id, 'provider_id' => $payment->provider_id, 'details' => $details],
            ));
        });

        $this->notifyProviderOnWhatsApp($booking);

        $payment->forceFill([
            'metadata' => [
                ...($payment->metadata ?? []),
                'booking_notifications_sent_at' => now()->toIso8601String(),
            ],
        ])->save();
    }

    private function safeNotifyBookingPaymentPaid(Payment $payment): void
    {
        if ($payment->booking) {
            app(GoogleCalendarService::class)->syncBookingSafely($payment->booking);
        }

        try {
            $this->notifyBookingPaymentPaid($payment);
        } catch (\Throwable $exception) {
            Log::warning('Paid booking notification failed without affecting payment confirmation.', [
                'payment_id' => $payment->id,
                'exception' => $exception::class,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    private function paymentConfirmationData(Payment $payment): array
    {
        $payment->loadMissing(['booking.service', 'provider.user:id,name']);

        return [
            'id' => $payment->id,
            'status' => $payment->status,
            'amount' => $payment->amount,
            'currency' => $payment->currency,
            'reference' => $payment->reference,
            'paid_at' => optional($payment->paid_at)->toIso8601String(),
            'booking' => $payment->booking ? [
                'id' => $payment->booking->id,
                'status' => $payment->booking->status,
                'date' => optional($payment->booking->date)->toDateString(),
                'time' => substr((string) $payment->booking->time, 0, 5),
                'service' => $payment->booking->service?->name,
                'provider' => $payment->provider?->user?->name,
            ] : null,
        ];
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

        $response = Http::external()->withBasicAuth($clientId, $secret)
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
        app(GoogleCalendarService::class)->syncBookingSafely($booking);
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
