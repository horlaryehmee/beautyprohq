<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\CrmActivity;
use App\Models\CrmCustomer;
use App\Models\DigitalProduct;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BusinessController extends Controller
{
    public function crm(Request $request): JsonResponse
    {
        $provider = $request->user()->providerProfile;
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
            ->latest('last_service_at')->paginate($request->integer('per_page', 20));

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
        abort_unless($provider->bookings()->where('customer_id', $customer->id)->exists(), 422, 'This customer has not booked with you.');
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
        abort_unless($provider->bookings()->where('customer_id', $customer->id)->exists(), 422, 'This customer has not booked with you.');
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
        ]);

        $provider = $request->user()->providerProfile;
        $provider->update([
            'loyalty_enabled' => $validated['enabled'],
            'loyalty_points_per_booking' => $validated['points_per_booking'],
            'loyalty_points_required' => $validated['points_required'],
        ]);

        return $this->success([
            'enabled' => (bool) $provider->loyalty_enabled,
            'points_per_booking' => (int) $provider->loyalty_points_per_booking,
            'points_required' => (int) $provider->loyalty_points_required,
        ], 'Loyalty settings updated.');
    }

    public function updateLoyalty(Request $request, User $customer): JsonResponse
    {
        $provider = $request->user()->providerProfile;
        abort_unless($provider->bookings()->where('customer_id', $customer->id)->exists(), 422, 'This customer has not booked with you.');
        $validated = $request->validate(['points' => ['required', 'integer', 'between:-100000,100000'], 'reason' => ['nullable', 'string', 'max:255']]);

        $loyalty = DB::transaction(function () use ($provider, $customer, $validated): Loyalty {
            $loyalty = Loyalty::lockForUpdate()->firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $customer->id]);
            abort_if($loyalty->points + $validated['points'] < 0, 422, 'The customer does not have enough points.');
            $loyalty->increment('points', $validated['points']);
            if ($validated['points'] > 0) {
                $loyalty->increment('lifetime_points', $validated['points']);
            }
            LoyaltyTransaction::create(['loyalty_id' => $loyalty->id, 'points' => $validated['points'], 'reason' => $validated['reason'] ?? 'Manual adjustment']);

            return $loyalty->fresh();
        });

        return $this->success($loyalty->load('customer:id,name,email'), 'Loyalty points updated.');
    }

    public function payments(Request $request): JsonResponse
    {
        $payments = Payment::where('provider_id', $request->user()->providerProfile->id)
            ->with(['booking.customer:id,name,email', 'booking.service'])
            ->latest()->paginate($request->integer('per_page', 20));

        return $this->success($payments->items(), meta: $this->paginationMeta($payments));
    }

    public function paymentAccounts(Request $request): JsonResponse
    {
        $accounts = $request->user()->providerProfile->paymentAccounts()->get()
            ->map(function ($account) {
                $settings = $account->settings ?? [];
                $account->has_secret_key = filled($settings['secret_key'] ?? null);
                $account->mode = $settings['mode'] ?? null;

                return $account;
            });

        return $this->success($accounts);
    }

    public function updatePaymentAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'gateway' => ['required', Rule::in(['paystack', 'stripe', 'paypal'])],
            'account_reference' => ['nullable', 'string', 'max:255'],
            'account_name' => ['nullable', 'string', 'max:255'],
            'account_identifier' => ['nullable', 'string', 'max:255'],
            'public_key' => ['nullable', 'string', 'max:500'],
            'settings' => ['nullable', 'array'],
            'settings.secret_key' => ['nullable', 'string', 'max:500'],
            'is_connected' => ['sometimes', 'boolean'],
            'enabled' => ['sometimes', 'boolean'],
        ]);
        if (! array_key_exists('account_reference', $validated) && isset($validated['account_identifier'])) {
            $validated['account_reference'] = $validated['account_identifier'];
        }
        if (! array_key_exists('is_connected', $validated) && array_key_exists('enabled', $validated)) {
            $validated['is_connected'] = $validated['enabled'];
        }
        $existing = $request->user()->providerProfile->paymentAccounts()
            ->where('gateway', $validated['gateway'])->first();
        $settings = $validated['settings'] ?? [];
        if (blank($settings['secret_key'] ?? null)) {
            $settings = $existing?->settings ?? [];
        }
        $validated['settings'] = $settings;
        $account = PaymentAccount::updateOrCreate(
            ['provider_id' => $request->user()->providerProfile->id, 'gateway' => $validated['gateway']],
            $validated
        );
        $account->has_secret_key = filled(($account->settings ?? [])['secret_key'] ?? null);

        return $this->success($account, 'Payment account updated.');
    }

    public function products(Request $request): JsonResponse
    {
        return $this->success($request->user()->providerProfile->digitalProducts()->latest()->get());
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $data = $this->productData($request);
        $data['currency'] ??= $request->user()->providerProfile->default_currency ?? config('currencies.default', 'NGN');
        $product = $request->user()->providerProfile->digitalProducts()->create($data);

        return $this->success($product, 'Digital product created.', 201);
    }

    public function updateProduct(Request $request, DigitalProduct $digitalProduct): JsonResponse
    {
        $this->ownProduct($request, $digitalProduct);
        $digitalProduct->update($this->productData($request, true));

        return $this->success($digitalProduct->fresh(), 'Digital product updated.');
    }

    public function destroyProduct(Request $request, DigitalProduct $digitalProduct): JsonResponse
    {
        $this->ownProduct($request, $digitalProduct);
        $digitalProduct->delete();

        return $this->success(null, 'Digital product removed.');
    }

    private function productData(Request $request, bool $partial = false): array
    {
        $p = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$p, 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:3000'],
            'price' => ['nullable', 'numeric', 'min:0'],
            'url' => [$p, 'url', 'max:500'],
            'image' => ['nullable', 'url', 'max:500'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    private function ownProduct(Request $request, DigitalProduct $product): void
    {
        abort_unless($product->provider_id === $request->user()->providerProfile->id, 403);
    }
}
