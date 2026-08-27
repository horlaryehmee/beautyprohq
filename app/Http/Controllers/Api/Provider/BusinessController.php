<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\CrmActivity;
use App\Models\CrmCustomer;
use App\Models\DigitalProduct;
use App\Models\Loyalty;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\User;
use App\Models\AppSetting;
use App\Models\Booking;
use App\Services\UploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BusinessController extends Controller
{
    private const PROVIDER_PAYMENT_GATEWAYS = ['paystack', 'manual'];

    public function crm(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        
        // Auto-create CRM entries from existing bookings
        $bookingCustomerIds = Booking::where('provider_id', $provider->id)
            ->whereNotNull('customer_id')
            ->distinct()
            ->pluck('customer_id');
        
        foreach ($bookingCustomerIds as $customerId) {
            CrmCustomer::firstOrCreate(
                ['provider_id' => $provider->id, 'customer_id' => $customerId],
                ['stage' => 'customer', 'priority' => 'normal', 'support_status' => 'none']
            );
        }

        $customers = CrmCustomer::where('provider_id', $provider->id)
            ->with([
                'customer:id,name,email,created_at,last_login_at',
                'customer.loyalties' => fn ($q) => $q->where('provider_id', $provider->id),
                'customer.customerBookings' => fn ($q) => $q
                    ->where('provider_id', $provider->id)
                    ->with(['service:id,name,price', 'payment:id,booking_id,amount,currency,status,paid_at'])
                    ->latest('date')
                    ->limit(20),
                'activities' => fn ($q) => $q->latest()->limit(20),
            ])
            ->latest('last_service_at')->paginate($this->perPage($request, 20, 50));

        $items = collect($customers->items())->map(function (CrmCustomer $record) {
            $bookings = $record->customer?->customerBookings ?? collect();
            $paid = $bookings->filter(fn ($booking) => $booking->payment?->status === 'paid');
            $record->setAttribute('crm_summary', [
                'bookings_count' => $bookings->count(),
                'completed_count' => $bookings->where('status', 'completed')->count(),
                'cancelled_count' => $bookings->whereIn('status', ['cancelled', 'rejected'])->count(),
                'pending_count' => $bookings->whereIn('status', ['pending', 'confirmed'])->count(),
                'total_spent' => (float) $paid->sum(fn ($booking) => (float) ($booking->payment?->amount ?? 0)),
                'currency' => $paid->first()?->payment?->currency ?? 'NGN',
                'last_booking_at' => optional($bookings->sortByDesc('date')->first())->date,
                'next_booking_at' => optional($bookings->filter(fn ($booking) => $booking->date?->isFuture() && in_array($booking->status, ['pending', 'confirmed'], true))->sortBy('date')->first())->date,
                'favorite_service' => $bookings->groupBy('service.name')->sortByDesc(fn ($group) => $group->count())->keys()->first(),
            ]);

            return $record;
        });

        return $this->success($items->values(), meta: $this->paginationMeta($customers));
    }

    public function updateCrm(Request $request, User $customer): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($this->canManageCrmCustomer($provider, $customer), 422, 'This customer is not in your CRM.');
        $validated = $request->validate([
            'notes' => ['nullable', 'string', 'max:5000'],
            'tags' => ['nullable', 'array'],
            'tags.*' => ['string', 'max:50'],
            'stage' => ['nullable', Rule::in(['lead', 'prospect', 'booked', 'customer', 'vip', 'inactive'])],
            'source' => ['nullable', 'string', 'max:80'],
            'priority' => ['nullable', Rule::in(['low', 'normal', 'high'])],
            'support_status' => ['nullable', Rule::in(['none', 'open', 'waiting', 'resolved'])],
            'next_follow_up_at' => ['nullable', 'date'],
        ]);
        $record = CrmCustomer::updateOrCreate(['provider_id' => $provider->id, 'customer_id' => $customer->id], $validated);

        return $this->success($record->load(['customer:id,name,email', 'activities' => fn ($q) => $q->latest()->limit(20)]), 'Customer CRM updated.');
    }

    public function storeCrmActivity(Request $request, User $customer): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($this->canManageCrmCustomer($provider, $customer), 422, 'This customer is not in your CRM.');
        $record = CrmCustomer::firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $customer->id]);
        $validated = $request->validate([
            'type' => ['required', Rule::in(['call', 'email', 'chat', 'task', 'workflow', 'support', 'note'])],
            'title' => ['required', 'string', 'max:160'],
            'description' => ['nullable', 'string', 'max:3000'],
            'status' => ['nullable', Rule::in(['open', 'done'])],
            'due_at' => ['nullable', 'date'],
        ]);
        if (($validated['status'] ?? 'open') === 'done') {
            $validated['completed_at'] = now();
        }
        $activity = $record->activities()->create($validated);

        return $this->success($activity, 'CRM activity added.', 201);
    }

    public function updateCrmActivity(Request $request, CrmActivity $activity): JsonResponse
    {
        abort_unless($activity->crmCustomer?->provider_id === $request->user()->providerProfile->id, 403);
        $validated = $request->validate([
            'status' => ['required', Rule::in(['open', 'done'])],
        ]);
        $activity->update($validated + ['completed_at' => $validated['status'] === 'done' ? now() : null]);

        return $this->success($activity->fresh(), 'CRM activity updated.');
    }

    public function loyalty(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;

        return $this->success([
            'settings' => [
                'enabled' => (bool) $provider->loyalty_enabled,
                'points_per_booking' => (int) ($provider->loyalty_points_per_booking ?? 10),
                'points_required' => (int) ($provider->loyalty_points_required ?? 100),
                'reward_value_amount' => (float) ($provider->loyalty_reward_value_amount ?? 0),
                'referral_rewards_enabled' => (bool) $provider->referral_rewards_enabled,
                'referral_points' => (int) ($provider->loyalty_referral_points ?? 0),
                'currency' => $provider->default_currency ?? config('currencies.default', 'NGN'),
            ],
            'customers' => Loyalty::where('provider_id', $provider->id)->with('customer:id,name,email')->latest()->get(),
            'rewards' => $provider->rewards()->orderBy('points_required')->get(),
        ]);
    }

    public function updateLoyaltySettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'points_per_booking' => ['required', 'integer', 'min:0', 'max:100000'],
            'points_required' => ['required', 'integer', 'min:1', 'max:1000000'],
            'reward_value_amount' => ['required', 'numeric', 'min:0.01', 'max:999999999'],
            'referral_rewards_enabled' => ['nullable', 'boolean'],
            'referral_points' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);

        $provider = $request->user()->providerProfile;
        $provider->update([
            'loyalty_enabled' => $validated['enabled'],
            'loyalty_points_per_booking' => $validated['points_per_booking'],
            'loyalty_points_required' => $validated['points_required'],
            'loyalty_reward_value_amount' => $validated['reward_value_amount'],
            'referral_rewards_enabled' => (bool) ($validated['referral_rewards_enabled'] ?? false),
            'loyalty_referral_points' => (int) ($validated['referral_points'] ?? 0),
        ]);

        return $this->success([
            'enabled' => (bool) $provider->loyalty_enabled,
            'points_per_booking' => (int) $provider->loyalty_points_per_booking,
            'points_required' => (int) $provider->loyalty_points_required,
            'reward_value_amount' => (float) $provider->loyalty_reward_value_amount,
            'referral_rewards_enabled' => (bool) $provider->referral_rewards_enabled,
            'referral_points' => (int) $provider->loyalty_referral_points,
            'currency' => $provider->default_currency ?? config('currencies.default', 'NGN'),
        ], 'Loyalty settings updated.');
    }

    public function payments(Request $request): JsonResponse
    {
        $payments = Payment::where('provider_id', $request->user()->providerProfile->id)
            ->with(['booking.customer:id,name,email', 'booking.service'])
            ->latest()->paginate($this->perPage($request, 20, 50));

        return $this->success($payments->items(), meta: $this->paginationMeta($payments));
    }

    public function settings(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;

        return $this->success([
            'default_currency' => $provider->default_currency ?? config('currencies.default', 'NGN'),
            'default_payment_gateway' => in_array($provider->default_payment_gateway, self::PROVIDER_PAYMENT_GATEWAYS, true) ? $provider->default_payment_gateway : null,
            'timezone' => $provider->timezone ?? 'Africa/Lagos',
            'whatsapp_feature_enabled' => $this->providerWhatsappFeatureEnabled(),
            'whatsapp_number' => $this->providerWhatsappFeatureEnabled() ? $provider->whatsapp_number : null,
            'whatsapp_notifications_enabled' => $this->providerWhatsappFeatureEnabled() && (bool) $provider->whatsapp_notifications_enabled,
            'payment_gateways' => $provider->paymentAccounts()->where(function ($query): void {
                $query->where('enabled', true)->orWhere('is_connected', true);
            })->whereIn('gateway', self::PROVIDER_PAYMENT_GATEWAYS)->pluck('gateway')->values(),
            'supported_currencies' => array_keys(config('currencies.supported', [])),
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'default_currency' => ['required', Rule::in(array_keys(config('currencies.supported', [])))],
            'default_payment_gateway' => ['nullable', Rule::in(self::PROVIDER_PAYMENT_GATEWAYS)],
            'timezone' => ['nullable', 'timezone'],
            'whatsapp_number' => ['nullable', 'string', 'max:40'],
            'whatsapp_notifications_enabled' => ['sometimes', 'boolean'],
        ]);

        $provider = $request->user()->providerProfile;
        if ($validated['default_payment_gateway']) {
            $hasGateway = $provider->paymentAccounts()
                ->where('gateway', $validated['default_payment_gateway'])
                ->where(function ($query): void {
                    $query->where('enabled', true)->orWhere('is_connected', true);
                })->exists();
            abort_unless($hasGateway, 422, 'Connect and enable this payment gateway before making it your default.');
        }

        if (! $this->providerWhatsappFeatureEnabled()) {
            unset($validated['whatsapp_number'], $validated['whatsapp_notifications_enabled']);
        }

        $provider->update($validated);

        return $this->settings($request);
    }

    private function providerWhatsappFeatureEnabled(): bool
    {
        return AppSetting::getValue('features.provider_whatsapp_notifications', '0') === '1';
    }

    private function canManageCrmCustomer($provider, User $customer): bool
    {
        return $provider->bookings()->where('customer_id', $customer->id)->exists()
            || CrmCustomer::where('provider_id', $provider->id)->where('customer_id', $customer->id)->exists();
    }

    public function paymentAccounts(Request $request): JsonResponse
    {
        $accounts = $request->user()->providerProfile->paymentAccounts()->whereIn('gateway', self::PROVIDER_PAYMENT_GATEWAYS)->get()
            ->map(function (PaymentAccount $account) {
                $settings = $account->settings ?? [];
                $account->has_secret_key = filled($settings['secret_key'] ?? null);
                $account->mode = $settings['mode'] ?? null;
                if ($account->gateway === 'manual') {
                    $account->instructions = $account->payment_instructions ?? $settings['instructions'] ?? null;
                }
                if ($account->gateway === 'paystack') {
                    $account->webhook_url = $this->paystackWebhookUrl($account);
                }

                return $account;
            });

        return $this->success($accounts);
    }

    public function updatePaymentAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'gateway' => ['required', Rule::in(self::PROVIDER_PAYMENT_GATEWAYS)],
            'account_reference' => ['nullable', 'string', 'max:255'],
            'account_name' => ['nullable', 'string', 'max:255'],
            'account_identifier' => ['nullable', 'string', 'max:255'],
            'public_key' => ['nullable', 'string', 'max:500'],
            'settings' => ['nullable', 'array'],
            'settings.secret_key' => ['nullable', 'string', 'max:500'],
            'settings.instructions' => ['nullable', 'string', 'max:2000'],
            'instructions' => ['nullable', 'string', 'max:2000'],
            'is_connected' => ['sometimes', 'boolean'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
        if (($validated['gateway'] ?? null) === 'manual') {
            $validated['payment_instructions'] = $validated['instructions'] ?? $validated['settings']['instructions'] ?? null;
            $validated['public_key'] = null;
            $validated['is_connected'] = $validated['enabled'] ?? true;
            $validated['enabled'] = $validated['enabled'] ?? true;
        }
        unset($validated['instructions']);
        if (! array_key_exists('account_reference', $validated) && isset($validated['account_identifier'])) {
            $validated['account_reference'] = $validated['account_identifier'];
        }
        if (! array_key_exists('is_connected', $validated) && array_key_exists('enabled', $validated)) {
            $validated['is_connected'] = $validated['enabled'];
        }
        $existing = $request->user()->providerProfile->paymentAccounts()
            ->where('gateway', $validated['gateway'])->first();
        $settings = [
            ...($existing?->settings ?? []),
            ...($validated['settings'] ?? []),
        ];
        if (blank($validated['settings']['secret_key'] ?? null)) {
            unset($settings['secret_key']);
            if (filled(($existing?->settings ?? [])['secret_key'] ?? null)) {
                $settings['secret_key'] = $existing->settings['secret_key'];
            }
        }
        $validated['settings'] = $settings;
        $account = PaymentAccount::updateOrCreate(
            ['provider_id' => $request->user()->providerProfile->id, 'gateway' => $validated['gateway']],
            $validated
        );
        $account->has_secret_key = filled(($account->settings ?? [])['secret_key'] ?? null);
        if ($account->gateway === 'manual') {
            $account->instructions = $account->payment_instructions ?? ($account->settings ?? [])['instructions'] ?? null;
        }
        if ($account->gateway === 'paystack') {
            $account->webhook_url = $this->paystackWebhookUrl($account);
        }

        return $this->success($account, 'Payment account updated.');
    }

    private function paystackWebhookUrl(PaymentAccount $account): string
    {
        $settings = $account->settings ?? [];
        if (blank($settings['webhook_token'] ?? null)) {
            $settings['webhook_token'] = Str::random(48);
            PaymentAccount::query()->findOrFail($account->id)
                ->forceFill(['settings' => $settings])
                ->save();
            $account->setAttribute('settings', $settings);
        }

        return url('/api/paystack/provider-webhook/'.$account->id.'/'.$settings['webhook_token']);
    }

    public function products(Request $request): JsonResponse
    {
        return $this->success($request->user()->providerProfile->digitalProducts()->latest()->get());
    }

    public function storeProduct(Request $request, UploadService $uploads): JsonResponse
    {
        $data = $this->productData($request, false, $uploads);
        $data['currency'] ??= $request->user()->providerProfile->default_currency ?? config('currencies.default', 'NGN');
        $product = $request->user()->providerProfile->digitalProducts()->create($data);

        return $this->success($product, 'Digital product created.', 201);
    }

    public function updateProduct(Request $request, DigitalProduct $digitalProduct, UploadService $uploads): JsonResponse
    {
        $this->ownProduct($request, $digitalProduct);
        $data = $this->productData($request, true, $uploads);
        $oldUrl = $digitalProduct->url;
        $oldImage = $digitalProduct->image;
        $digitalProduct->update($data);

        if (array_key_exists('url', $data)) {
            $this->deleteStoredUpload($oldUrl);
        }
        if (array_key_exists('image', $data)) {
            $this->deleteStoredUpload($oldImage);
        }

        return $this->success($digitalProduct->fresh(), 'Digital product updated.');
    }

    public function destroyProduct(Request $request, DigitalProduct $digitalProduct): JsonResponse
    {
        $this->ownProduct($request, $digitalProduct);
        $this->deleteStoredUpload($digitalProduct->url);
        $this->deleteStoredUpload($digitalProduct->image);
        $digitalProduct->delete();

        return $this->success(null, 'Digital product removed.');
    }

    private function productData(Request $request, bool $partial, UploadService $uploads): array
    {
        $p = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'name' => [$p, 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:3000'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'url' => [$partial ? 'sometimes' : 'required', 'url:http,https', 'max:1000'],
            'image' => ['nullable', 'string', 'max:1000'],
            'image_file' => ['sometimes', 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($request->hasFile('image_file')) {
            $data['image'] = $uploads->store($request->file('image_file'))['path'];
        }

        unset($data['image_file']);

        return $data;
    }

    private function ownProduct(Request $request, DigitalProduct $product): void
    {
        abort_unless($product->provider_id === $request->user()->providerProfile->id, 403);
    }

    private function deleteStoredUpload(?string $path): void
    {
        $path = str_replace('\\', '/', trim((string) $path));
        if ($path === '' || str_starts_with($path, '/') || str_contains($path, '..') || preg_match('#^https?://#i', $path)) {
            return;
        }

        Storage::disk((string) config('filesystems.upload_disk', 'public'))->delete(preg_replace('#^storage/#', '', $path));
    }
}
