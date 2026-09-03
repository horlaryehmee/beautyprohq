<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Crypt;

class Subscription extends Model
{
    protected $guarded = [];

    public const PAID_PLANS = ['paid', 'pro', 'daily_test'];

    protected $hidden = ['secure_metadata'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'starts_at' => 'datetime',
            'renews_at' => 'datetime',
            'ends_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'metadata' => 'array',
            'secure_metadata' => 'encrypted:array',
        ];
    }

    public function setMetadataAttribute(mixed $value): void
    {
        if ($value === null) {
            $this->attributes['metadata'] = null;
            $this->attributes['secure_metadata'] = null;

            return;
        }

        $metadata = is_string($value) ? json_decode($value, true) : $value;
        $metadata = is_array($metadata) ? $metadata : [];
        $secure = $this->secure_metadata ?? [];

        if (($metadata['gateway'] ?? 'paystack') !== 'paystack') {
            unset($secure['paystack_email_token']);
            $this->attributes['secure_metadata'] = $secure === []
                ? null
                : Crypt::encryptString(json_encode($secure, JSON_THROW_ON_ERROR));
        }

        if (array_key_exists('paystack_email_token', $metadata)) {
            $secure['paystack_email_token'] = $metadata['paystack_email_token'];
            unset($metadata['paystack_email_token']);
            $this->attributes['secure_metadata'] = Crypt::encryptString(json_encode($secure, JSON_THROW_ON_ERROR));
        }

        $this->attributes['metadata'] = json_encode($metadata, JSON_THROW_ON_ERROR);
    }

    public function gatewaySecret(string $key): mixed
    {
        return data_get($this->secure_metadata ?? [], $key);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function planDefinition(): BelongsTo
    {
        return $this->belongsTo(SubscriptionPlan::class, 'subscription_plan_id');
    }

    public function isActive(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }

        $periodEndsAt = $this->ends_at ?: $this->renews_at;
        if (in_array($this->plan, self::PAID_PLANS, true) && ! $periodEndsAt) {
            return false;
        }

        return ! $periodEndsAt || $periodEndsAt->isFuture();
    }

    public function isPaid(): bool
    {
        return $this->isActive() && in_array($this->plan, self::PAID_PLANS, true);
    }
}
