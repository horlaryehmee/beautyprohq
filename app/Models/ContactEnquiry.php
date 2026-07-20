<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ContactEnquiry extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
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
}
