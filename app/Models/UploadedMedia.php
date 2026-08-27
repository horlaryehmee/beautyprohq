<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class UploadedMedia extends Model
{
    protected $table = 'uploaded_media';

    protected $guarded = [];

    protected $appends = ['url', 'type'];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getUrlAttribute(): string
    {
        return Storage::disk($this->disk)->url($this->path);
    }

    public function getTypeAttribute(): string
    {
        return str_starts_with((string) $this->mime_type, 'image/') ? 'image' : 'document';
    }
}
