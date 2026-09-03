<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NewsletterUnsubscribe extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['unsubscribed_at' => 'datetime'];
    }

    public static function record(string $email): self
    {
        return static::updateOrCreate(
            ['email_hash' => hash('sha256', str($email)->lower()->trim()->toString())],
            ['unsubscribed_at' => now()]
        );
    }
}
