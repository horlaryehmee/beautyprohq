<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class PortfolioItem extends Model
{
    protected $guarded = [];

    protected $appends = ['url'];

    protected function casts(): array
    {
        return ['is_demo' => 'boolean'];
    }

    public function getUrlAttribute(): ?string
    {
        $path = $this->media_url;
        if (! $path) {
            return null;
        }

        if (preg_match('/^https?:\/\//i', $path)) {
            return preg_replace('/^http:\/\//i', 'https://', $path);
        }

        $url = str_starts_with($path, '/')
            ? rtrim((string) config('app.url'), '/').$path
            : Storage::disk(config('filesystems.upload_disk', 'public'))->url($path);

        return preg_replace('/^http:\/\//i', 'https://', $url);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(ProviderProfile::class, 'provider_id');
    }
}
