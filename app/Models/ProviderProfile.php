<?php

namespace App\Models;

use App\Support\CurrencyResolver;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class ProviderProfile extends Model
{
    use HasFactory;

    protected $guarded = [];

    protected static function booted(): void
    {
        static::updated(function (ProviderProfile $provider): void {
            if (! $provider->wasChanged('default_currency')) {
                return;
            }

            $currency = strtoupper((string) $provider->default_currency);
            $previousCurrency = strtoupper((string) ($provider->getOriginal('default_currency') ?: config('currencies.default', 'NGN')));

            if ($provider->base_price !== null) {
                $provider->newQuery()->whereKey($provider->id)->update([
                    'base_price' => CurrencyResolver::convert((float) $provider->base_price, $previousCurrency, $currency),
                ]);
            }

            $provider->services()->where(function ($query) use ($currency): void {
                $query->whereNull('currency')->orWhere('currency', '!=', $currency);
            })->get()->each(function (Service $service) use ($currency, $previousCurrency): void {
                $sourceCurrency = strtoupper((string) ($service->currency ?: $previousCurrency));
                $service->update([
                    'price' => CurrencyResolver::convert((float) $service->price, $sourceCurrency, $currency),
                    'currency' => $currency,
                ]);
            });

            $provider->digitalProducts()->where(function ($query) use ($currency): void {
                $query->whereNull('currency')->orWhere('currency', '!=', $currency);
            })->get()->each(function (DigitalProduct $product) use ($currency, $previousCurrency): void {
                $sourceCurrency = strtoupper((string) ($product->currency ?: $previousCurrency));
                $product->update([
                    ...($product->price !== null ? ['price' => CurrencyResolver::convert((float) $product->price, $sourceCurrency, $currency)] : []),
                    'currency' => $currency,
                ]);
            });
        });
    }

    protected function casts(): array
    {
        return [
            'verified' => 'boolean',
            'is_demo' => 'boolean',
            'is_listed' => 'boolean',
            'is_pro_of_week' => 'boolean',
            'rating' => 'decimal:2',
            'social_links' => 'array',
            'portfolio_links' => 'array',
            'digital_product_links' => 'array',
            'booking_form_fields' => 'array',
            'loyalty_enabled' => 'boolean',
            'loyalty_reward_value_amount' => 'decimal:2',
            'referral_rewards_enabled' => 'boolean',
            'whatsapp_notifications_enabled' => 'boolean',
            'base_price' => 'decimal:2',
            'terms_accepted_at' => 'datetime',
            'onboarding_completed_at' => 'datetime',
            'account_approved_at' => 'datetime',
            'account_declined_at' => 'datetime',
        ];
    }

    protected $appends = ['onboarding_complete', 'account_approved', 'account_approval_status', 'profile_photo_url', 'cover_image_url'];

    public function getProfilePhotoUrlAttribute(): ?string
    {
        return $this->absoluteMediaUrl($this->profile_photo);
    }

    public function getCoverImageUrlAttribute(): ?string
    {
        return $this->absoluteMediaUrl($this->cover_image);
    }

    private function absoluteMediaUrl(?string $value): ?string
    {
        if (! $value) {
            return null;
        }

        if (preg_match('/^https?:\/\//i', $value)) {
            return preg_replace('/^http:\/\//i', 'https://', $value);
        }

        $url = str_starts_with($value, '/')
            ? rtrim((string) config('app.url'), '/').$value
            : Storage::disk(config('filesystems.upload_disk', 'public'))->url($value);

        return preg_replace('/^http:\/\//i', 'https://', $url);
    }

    public function getOnboardingCompleteAttribute(): bool
    {
        return filled($this->onboarding_completed_at);
    }

    public function getAccountApprovedAttribute(): bool
    {
        return filled($this->account_approved_at);
    }

    public function getAccountApprovalStatusAttribute(): string
    {
        if (filled($this->account_approved_at)) {
            return 'approved';
        }

        if (filled($this->account_declined_at)) {
            return 'declined';
        }

        return 'pending';
    }

    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        return $query->where(is_numeric($value) ? 'id' : 'slug', $value);
    }

    public function scopeDirectory(Builder $query): Builder
    {
        return $query
            ->where('is_listed', true)
            ->whereNotNull('account_approved_at')
            ->whereHas('user', fn (Builder $q) => $q->where('is_active', true));
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

    public function liveChatConversations(): HasMany
    {
        return $this->hasMany(LiveChatConversation::class, 'provider_id');
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

    public function contactEnquiries(): HasMany
    {
        return $this->hasMany(ContactEnquiry::class, 'provider_id');
    }

    public function communityPosts(): HasMany
    {
        return $this->hasMany(CommunityPost::class, 'provider_id');
    }
}
