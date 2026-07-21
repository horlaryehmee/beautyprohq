<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProviderProfile extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'verified' => 'boolean',
            'is_listed' => 'boolean',
            'is_pro_of_week' => 'boolean',
            'rating' => 'decimal:2',
            'social_links' => 'array',
            'portfolio_links' => 'array',
            'digital_product_links' => 'array',
            'booking_form_fields' => 'array',
            'loyalty_enabled' => 'boolean',
            'whatsapp_notifications_enabled' => 'boolean',
            'base_price' => 'decimal:2',
            'terms_accepted_at' => 'datetime',
            'onboarding_completed_at' => 'datetime',
        ];
    }

    protected $appends = ['onboarding_complete'];

    public function getOnboardingCompleteAttribute(): bool
    {
        return filled($this->onboarding_completed_at);
    }

    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        return $query->where(is_numeric($value) ? 'id' : 'slug', $value);
    }

    public function scopeDirectory(Builder $query): Builder
    {
        return $query->where('is_listed', true)->whereHas('user', fn (Builder $q) => $q->where('is_active', true));
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProviderCategory::class, 'provider_category_id');
    }

    public function services(): HasMany
    {
        return $this->hasMany(Service::class, 'provider_id');
    }

    public function availability(): HasMany
    {
        return $this->hasMany(Availability::class, 'provider_id');
    }

    public function blockedDates(): HasMany
    {
        return $this->hasMany(BlockedDate::class, 'provider_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'provider_id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class, 'provider_id');
    }

    public function recalculateRating(): void
    {
        $this->forceFill([
            'rating' => round((float) $this->reviews()->where('is_approved', true)->avg('rating'), 2),
            'review_count' => $this->reviews()->where('is_approved', true)->count(),
        ])->save();
    }

    public function portfolioItems(): HasMany
    {
        return $this->hasMany(PortfolioItem::class, 'provider_id');
    }

    public function verificationRequests(): HasMany
    {
        return $this->hasMany(VerificationRequest::class, 'provider_id');
    }

    public function digitalProducts(): HasMany
    {
        return $this->hasMany(DigitalProduct::class, 'provider_id');
    }

    public function paymentAccounts(): HasMany
    {
        return $this->hasMany(PaymentAccount::class, 'provider_id');
    }

    public function rewards(): HasMany
    {
        return $this->hasMany(Reward::class, 'provider_id');
    }

    public function savedBy(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'saved_providers', 'provider_id', 'customer_id');
    }
}
