<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class HomepageSetting extends Model
{
    protected $primaryKey = 'section';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];
}
