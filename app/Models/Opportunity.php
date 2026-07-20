<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Opportunity extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['contact_info' => 'array', 'deadline' => 'date:Y-m-d', 'published_at' => 'datetime'];
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->whereNotNull('published_at')->where('published_at', '<=', now());
    }

    public function enquiries(): HasMany
    {
        return $this->hasMany(OpportunityEnquiry::class);
    }
}
