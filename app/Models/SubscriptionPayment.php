<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class SubscriptionPayment extends Model
{
    protected $guarded = [];

    protected $hidden = [
        'access_code',
        'raw_response',
        'secure_payload',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'access_code' => 'encrypted',
            'paid_at' => 'datetime',
            'raw_response' => 'array',
            'secure_payload' => 'encrypted:array',
        ];
    }

    public function setRawResponseAttribute(mixed $value): void
    {
        if ($value === null) {
            $this->attributes['raw_response'] = null;
            $this->attributes['secure_payload'] = null;

            return;
        }

        $payload = is_string($value) ? json_decode($value, true) : $value;
        $payload = is_array($payload) ? $payload : [];
        $this->attributes['secure_payload'] = Crypt::encryptString(json_encode($payload, JSON_THROW_ON_ERROR));
        $this->attributes['raw_response'] = json_encode($this->sanitisePayload($payload), JSON_THROW_ON_ERROR);
    }

    public function gatewayPayload(): array
    {
        return $this->secure_payload ?: ($this->raw_response ?? []);
    }

    private function sanitisePayload(array $payload): array
    {
        $sensitiveKeys = [
            'access_code', 'account_number', 'authorization', 'authorization_url', 'bank',
            'card', 'client_secret', 'customer', 'email_token', 'secret',
        ];

        foreach ($payload as $key => $value) {
            if (in_array(strtolower((string) $key), $sensitiveKeys, true)) {
                unset($payload[$key]);
            } elseif (is_array($value)) {
                $payload[$key] = $this->sanitisePayload($value);
            }
        }

        return $payload;
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}
