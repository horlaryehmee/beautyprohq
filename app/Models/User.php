<?php

namespace App\Models;

use App\Notifications\BeautyProResetPasswordNotification;
use App\Notifications\BeautyProVerifyEmailNotification;
use Database\Factories\UserFactory;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'phone', 'password', 'role', 'preferred_currency', 'is_demo', 'is_guest', 'is_active', 'two_factor_enabled', 'two_factor_method', 'two_factor_confirmed_at', 'two_factor_code_hash', 'two_factor_code_expires_at', 'two_factor_totp_secret', 'two_factor_recovery_codes', 'email_verified_at', 'last_login_at'];

    protected $hidden = ['password', 'remember_token', 'two_factor_code_hash', 'two_factor_totp_secret', 'two_factor_recovery_codes'];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'two_factor_confirmed_at' => 'datetime',
            'two_factor_code_expires_at' => 'datetime',
            'two_factor_enabled' => 'boolean',
            'two_factor_totp_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'is_demo' => 'boolean',
            'is_active' => 'boolean',
            'is_guest' => 'boolean',
            'password' => 'hashed',
        ];
    }

    public function providerProfile(): HasOne
    {
        return $this->hasOne(ProviderProfile::class);
    }

    public function customerBookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'customer_id');
    }

    public function savedProviders(): BelongsToMany
    {
        return $this->belongsToMany(ProviderProfile::class, 'saved_providers', 'customer_id', 'provider_id')->withTimestamps();
    }

    public function loyalties(): HasMany
    {
        return $this->hasMany(Loyalty::class, 'customer_id');
    }

    public function liveChatConversations(): HasMany
    {
        return $this->hasMany(LiveChatConversation::class, 'customer_id');
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    public function subscriptionPayments(): HasMany
    {
        return $this->hasMany(SubscriptionPayment::class);
    }

    public function activeSubscription(): HasOne
    {
        return $this->hasOne(Subscription::class)
            ->ofMany(['id' => 'max'], fn ($query) => $query->where('status', 'active'))
            ->where('status', 'active');
    }

    public function hasPaidPlan(): bool
    {
        $this->expireElapsedPaidAccess();
        $this->restorePrematurelyCancelledPaidAccess();

        $subscription = $this->relationLoaded('activeSubscription')
            ? $this->activeSubscription
            : $this->activeSubscription()->first();

        return $subscription?->isPaid() ?? false;
    }

    public function expireElapsedPaidAccess(): bool
    {
        if (! $this->isProvider()) {
            return false;
        }

        $expired = false;

        DB::transaction(function () use (&$expired): void {
            $subscriptions = $this->subscriptions()
                ->whereIn('plan', Subscription::PAID_PLANS)
                ->where('status', 'active')
                ->where(function ($query): void {
                    $query->where('ends_at', '<=', now())
                        ->orWhere(function ($query): void {
                            $query->whereNull('ends_at')->where('renews_at', '<=', now());
                        });
                })
                ->lockForUpdate()
                ->get();

            foreach ($subscriptions as $subscription) {
                $metadata = $subscription->metadata ?? [];
                $periodEndedAt = $subscription->ends_at ?: $subscription->renews_at ?: now();
                $cancelled = $subscription->cancelled_at || (bool) ($metadata['cancel_at_period_end'] ?? false);

                $metadata['paid_access_ended_at'] = now()->toIso8601String();

                $subscription->update([
                    'status' => $cancelled ? 'cancelled' : 'expired',
                    'ends_at' => $periodEndedAt,
                    'metadata' => $metadata,
                ]);

                $expired = true;
            }
        });

        if ($expired) {
            $this->unsetRelation('activeSubscription');
        }

        return $expired;
    }

    public function restorePrematurelyCancelledPaidAccess(): bool
    {
        if (! $this->isProvider()) {
            return false;
        }

        $subscription = $this->subscriptions()
            ->whereIn('plan', ['paid', 'pro', 'daily_test'])
            ->where('status', 'cancelled')
            ->whereNotNull('renews_at')
            ->where('renews_at', '>', now())
            ->latest('renews_at')
            ->first();

        if (! $subscription) {
            return false;
        }

        $linkedFreeSubscriptions = $this->subscriptions()
            ->where('plan', 'free')
            ->where('status', 'active')
            ->get()
            ->filter(fn (Subscription $free): bool => (int) data_get($free->metadata, 'downgraded_from_subscription_id') === (int) $subscription->id);
        $wasLegacyImmediateDowngrade = data_get($subscription->metadata, 'cancelled_to_free_at') !== null
            || data_get($subscription->metadata, 'cancel_at_period_end') === false
            || $linkedFreeSubscriptions->isNotEmpty();

        if (! $wasLegacyImmediateDowngrade) {
            return false;
        }

        DB::transaction(function () use ($subscription): void {
            $paid = $this->subscriptions()
                ->whereKey($subscription->id)
                ->lockForUpdate()
                ->first();

            if (! $paid || ! $paid->renews_at || ! $paid->renews_at->isFuture()) {
                return;
            }

            $metadata = $paid->metadata ?? [];
            $metadata['cancel_at_period_end'] = true;
            $metadata['access_ends_at'] = $paid->renews_at->toIso8601String();
            $metadata['restored_after_premature_free_at'] = now()->toIso8601String();

            $paid->update([
                'status' => 'active',
                'ends_at' => $paid->renews_at,
                'metadata' => $metadata,
            ]);

            $this->subscriptions()
                ->where('plan', 'free')
                ->where('status', 'active')
                ->lockForUpdate()
                ->get()
                ->filter(fn (Subscription $free): bool => (int) data_get($free->metadata, 'downgraded_from_subscription_id') === (int) $paid->id)
                ->each(fn (Subscription $free): bool => $free->update([
                    'status' => 'cancelled',
                    'ends_at' => now(),
                    'cancelled_at' => now(),
                    'metadata' => array_merge($free->metadata ?? [], [
                        'cancelled_because_paid_access_was_restored_at' => now()->toIso8601String(),
                    ]),
                ]));
        });

        $this->unsetRelation('activeSubscription');

        return true;
    }

    public function isProvider(): bool
    {
        return $this->role === 'provider';
    }

    public function isCustomer(): bool
    {
        return $this->role === 'customer';
    }

    public function isAdmin(): bool
    {
        return $this->role === 'admin';
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new BeautyProResetPasswordNotification($token));
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new BeautyProVerifyEmailNotification());
    }
}
