<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('verification_requests')->orderBy('id')->chunkById(100, function ($requests): void {
            foreach ($requests as $request) {
                $userId = DB::table('provider_profiles')->where('id', $request->provider_id)->value('user_id');
                $updates = [];

                foreach (['certification_files' => 'provider_verification_certification', 'license_files' => 'provider_verification_license'] as $column => $collection) {
                    $references = $this->decodeReferences($request->{$column});
                    $secured = array_map(
                        fn (string $reference): string => $this->secureReference($reference, $userId ? (int) $userId : null, $collection),
                        $references,
                    );

                    if ($secured !== $references) {
                        $updates[$column] = json_encode($secured, JSON_UNESCAPED_SLASHES);
                    }
                }

                if ($updates !== []) {
                    DB::table('verification_requests')->where('id', $request->id)->update($updates);
                }
            }
        });
    }

    public function down(): void
    {
        // Deliberately irreversible: a rollback must never make confidential documents public again.
    }

    private function decodeReferences(mixed $value): array
    {
        $decoded = is_string($value) ? json_decode($value, true) : $value;

        return array_values(array_filter(is_array($decoded) ? $decoded : [], 'is_string'));
    }

    private function secureReference(string $reference, ?int $userId, string $collection): string
    {
        if (preg_match('/^media:(\d+)$/', $reference)) {
            return $reference;
        }

        $normalised = str_replace('\\', '/', trim($reference));
        if (preg_match('#^https?://#i', $normalised)) {
            $normalised = (string) parse_url($normalised, PHP_URL_PATH);
        }
        $path = preg_replace('#^/?storage/#', '', ltrim($normalised, '/'));
        if ($path === '' || str_contains($path, '..') || ! str_starts_with($path, 'uploads/')) {
            return $reference;
        }

        $media = DB::table('uploaded_media')->where('path', $path)->first();
        $sourceDiskName = $media?->disk ?: (string) config('filesystems.upload_disk', 'public');
        $source = Storage::disk($sourceDiskName);
        $private = Storage::disk('verification');

        if (! $source->exists($path)) {
            return $reference;
        }

        if (! $private->exists($path)) {
            $stream = $source->readStream($path);
            if (! is_resource($stream)) {
                throw new RuntimeException("Could not read verification document {$path} during private-storage migration.");
            }

            try {
                if (! $private->writeStream($path, $stream, ['visibility' => 'private'])) {
                    throw new RuntimeException("Could not write verification document {$path} to private storage.");
                }
            } finally {
                fclose($stream);
            }
        }

        if ($private->size($path) !== $source->size($path)) {
            $private->delete($path);

            throw new RuntimeException("Verification document {$path} failed private-storage integrity validation.");
        }

        $attributes = [
            'user_id' => $userId,
            'disk' => 'verification',
            'path' => $path,
            'filename' => basename($path),
            'original_name' => $media?->original_name ?: basename($path),
            'mime_type' => $media?->mime_type ?: $private->mimeType($path),
            'size' => $private->size($path),
            'extension' => strtolower(pathinfo($path, PATHINFO_EXTENSION)),
            'collection' => $collection,
            'updated_at' => now(),
        ];

        if ($media) {
            DB::table('uploaded_media')->where('id', $media->id)->update($attributes);
            $mediaId = (int) $media->id;
        } else {
            $mediaId = (int) DB::table('uploaded_media')->insertGetId($attributes + ['created_at' => now()]);
        }

        if ($sourceDiskName !== 'verification') {
            $source->delete($path);
        }

        return 'media:'.$mediaId;
    }
};
