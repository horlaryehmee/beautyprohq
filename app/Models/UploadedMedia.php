<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

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
        if ($this->disk === 'verification') {
            return URL::temporarySignedRoute(
                'media.download',
                now()->addMinutes(30),
                ['media' => $this->getKey()],
            );
        }

        $url = Storage::disk($this->disk)->url($this->path);

        return preg_replace('/^http:\/\//i', 'https://', $url);
    }

    public function getTypeAttribute(): string
    {
        return str_starts_with((string) $this->mime_type, 'image/') ? 'image' : 'document';
    }
}
