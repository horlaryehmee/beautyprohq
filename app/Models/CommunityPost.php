<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class CommunityPost extends Model
{
    protected $guarded = [];

    protected static function booted(): void
    {
        static::saving(function (CommunityPost $post): void {
            if (! Schema::hasColumn($post->getTable(), 'slug')) {
                return;
            }

            $source = $post->slug ?: $post->title ?: 'community-story';
            $post->slug = static::uniqueSlug($source, $post->exists ? $post : null);
        });
    }

    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'newsletter_notify_requested_at' => 'datetime',
            'newsletter_notified_at' => 'datetime',
            'is_demo' => 'boolean',
            'mentions' => 'array',
            'rules' => 'array',
        ];
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->whereNotNull('published_at')->where('published_at', '<=', now());
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(ProviderProfile::class, 'provider_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(CommunityComment::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(CommunityReaction::class);
    }

    public function shares(): HasMany
    {
        return $this->hasMany(CommunityShare::class);
    }

    public function reports(): HasMany
    {
        return $this->hasMany(CommunityReport::class);
    }

    public function resolveRouteBinding($value, $field = null): ?self
    {
        return $this->where('slug', $value)
            ->when(is_numeric($value), fn (Builder $query) => $query->orWhere($this->getKeyName(), $value))
            ->first();
    }

    private static function uniqueSlug(string $value, ?self $ignore = null): string
    {
        $base = Str::slug($value) ?: 'community-story';
        $slug = $base;
        $counter = 1;

        while (
            static::query()
                ->where('slug', $slug)
                ->when($ignore, fn (Builder $query) => $query->whereKeyNot($ignore->getKey()))
                ->exists()
        ) {
            $slug = $base.'-'.$counter++;
        }

        return $slug;
    }
}
