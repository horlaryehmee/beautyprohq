<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    protected $guarded = [];

    public function toArray(): array
    {
        $attributes = parent::toArray();

        if (is_array($attributes['metadata'] ?? null)) {
            unset($attributes['metadata']['gateway_response']);
        }

        return $attributes;
    }

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'metadata' => 'array', 'paid_at' => 'datetime'];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(ProviderProfile::class, 'provider_id');
    }
}
