<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Notifications\Notifiable;

class NewsletterSubscriber extends Model
{
    use Notifiable;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['subscribed_at' => 'datetime', 'unsubscribed_at' => 'datetime'];
    }
}
