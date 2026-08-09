<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContactEnquiry extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'provider_id',
        'reason',
        'name',
        'email',
        'phone',
        'instagram',
        'company_name',
        'website',
        'detail_type',
        'message',
        'status',
    ];

    public function provider(): BelongsTo
    {
        return $this->belongsTo(ProviderProfile::class, 'provider_id');
    }
}
