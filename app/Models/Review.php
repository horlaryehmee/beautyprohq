<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    protected $guarded = [];

    protected static function booted(): void
    {
        $recalculate = function (Review $review): void {
            $review->provider?->recalculateRating();
        };

        static::created($recalculate);
        static::updated($recalculate);
        static::deleted($recalculate);
    }

    protected function casts(): array
    {
        return ['is_approved' => 'boolean'];
    }

    public function booking(): BelongsTo
    {
        return $this->belongsTo(Booking::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(ProviderProfile::class, 'provider_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'customer_id');
    }
}
