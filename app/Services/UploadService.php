<?php

namespace App\Services;

use App\Models\UploadedMedia;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\JpegEncoder;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;

class UploadService
{
    private const UPLOAD_DIRECTORY = 'uploads';

    private const BLOCKED_EXTENSIONS = [
        'asp', 'aspx', 'bat', 'cgi', 'cmd', 'com', 'dll', 'exe', 'htaccess', 'jar', 'js', 'jsp',
        'msi', 'phtml', 'phar', 'php', 'php3', 'php4', 'php5', 'php7', 'php8', 'pl', 'ps1',
        'py', 'rb', 'sh', 'vbs',
    ];

    public function store(UploadedFile $file, ?User $user = null, ?string $collection = null): array
    {
        $this->guardExecutableFile($file);
        $this->ensureUploadDirectoryIsHardened();

        $stored = str_starts_with((string) $file->getMimeType(), 'image/')
            ? $this->storeOptimizedImage($file)
            : $this->storeFile($file);

        return $this->recordMedia($stored, $file, $user ?: Auth::user(), $collection);
    }

    public function list(): array
    {
        $this->ensureUploadDirectoryIsHardened();

        return $this->files();
    }

    public function paginate(int $page = 1, int $perPage = 20, array $filters = []): LengthAwarePaginator
    {
        if ($this->mediaTableExists()) {
            return $this->paginateRecordedMedia($page, $perPage, $filters);
        }

        $files = collect($this->list());
        $page = max(1, $page);
        $perPage = max(1, min(100, $perPage));

        return new LengthAwarePaginator(
            $files->forPage($page, $perPage)->values(),
            $files->count(),
            $perPage,
            $page,
        );
    }

    public function delete(string $path): void
    {
        $path = $this->sanitizeUploadPath($path);
        $disk = Storage::disk($this->diskName());

        if (! $disk->exists($path)) {
            throw ValidationException::withMessages([
                'path' => 'The selected media file no longer exists.',
            ]);
        }

        $disk->delete($path);

        if ($this->mediaTableExists()) {
            UploadedMedia::where('path', $path)->delete();
        }
    }

    private function files(): array
    {
        return collect(Storage::disk($this->diskName())->files(self::UPLOAD_DIRECTORY))
            ->reject(fn (string $path): bool => basename($path) === '.htaccess')
            ->map(fn (string $path): array => [
                'name' => basename($path),
                'path' => $path,
                'url' => Storage::disk($this->diskName())->url($path),
                'mime_type' => Storage::disk($this->diskName())->mimeType($path),
                'size' => Storage::disk($this->diskName())->size($path),
                'last_modified' => Storage::disk($this->diskName())->lastModified($path),
            ])
            ->sortByDesc('last_modified')
            ->values()
            ->all();
    }

    private function storeOptimizedImage(UploadedFile $file): array
    {
        if (! class_exists(ImageManager::class)) {
            return $this->storeFile($file);
        }

        $useWebp = function_exists('imagewebp');
        $extension = $useWebp ? 'webp' : 'jpg';
        $filename = $this->uniqueFilename($extension);
        $path = self::UPLOAD_DIRECTORY.'/'.$filename;

        $manager = new ImageManager(new Driver());
        $image = $manager->read($file->getRealPath())->scaleDown(width: 1600, height: 1600);
        $encoded = $image->encode($useWebp ? new WebpEncoder(quality: 75) : new JpegEncoder(quality: 75));

        Storage::disk($this->diskName())->put($path, (string) $encoded, ['visibility' => 'public']);

        return $this->storedPayload($path, $filename, (string) Storage::disk($this->diskName())->mimeType($path));
    }

    private function storeFile(UploadedFile $file): array
    {
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'bin');
        $filename = $this->uniqueFilename($extension);
        $path = Storage::disk($this->diskName())->putFileAs(
            self::UPLOAD_DIRECTORY,
            $file,
            $filename,
            ['visibility' => 'public']
        );

        return $this->storedPayload($path, $filename, (string) $file->getMimeType());
    }

    private function storedPayload(string $path, string $filename, string $mimeType): array
    {
        return [
            'success' => true,
            'url' => Storage::disk($this->diskName())->url($path),
            'path' => $path,
            'filename' => $filename,
            'mime_type' => $mimeType,
            'size' => Storage::disk($this->diskName())->size($path),
        ];
    }

    private function recordMedia(array $stored, UploadedFile $file, ?User $user, ?string $collection): array
    {
        if (! $this->mediaTableExists()) {
            return $stored;
        }

        $media = UploadedMedia::updateOrCreate(
            ['path' => $stored['path']],
            [
                'user_id' => $user?->id,
                'disk' => $this->diskName(),
                'filename' => $stored['filename'],
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $stored['mime_type'] ?: $file->getMimeType(),
                'size' => $stored['size'],
                'extension' => strtolower(pathinfo($stored['filename'], PATHINFO_EXTENSION)),
                'collection' => $collection,
            ],
        );

        return $this->mediaPayload($media->fresh('user'));
    }

    private function paginateRecordedMedia(int $page, int $perPage, array $filters): LengthAwarePaginator
    {
        $this->syncStoredFilesToMediaRecords();

        $query = UploadedMedia::with('user.providerProfile:id,user_id,slug,name')
            ->latest();

        if (($filters['type'] ?? null) === 'image') {
            $query->where('mime_type', 'like', 'image/%');
        } elseif (($filters['type'] ?? null) === 'document') {
            $query->where('mime_type', 'not like', 'image/%');
        }

        if (filled($filters['collection'] ?? null)) {
            $query->where('collection', $filters['collection']);
        }

        if (filled($filters['user_id'] ?? null)) {
            $query->where('user_id', (int) $filters['user_id']);
        }

        if (filled($filters['role'] ?? null)) {
            $query->whereHas('user', fn ($userQuery) => $userQuery->where('role', $filters['role']));
        }

        if (filled($filters['search'] ?? null)) {
            $search = trim((string) $filters['search']);
            $query->where(function ($searchQuery) use ($search): void {
                $searchQuery
                    ->where('filename', 'like', "%{$search}%")
                    ->orWhere('original_name', 'like', "%{$search}%")
                    ->orWhere('path', 'like', "%{$search}%")
                    ->orWhereHas('user', fn ($userQuery) => $userQuery
                        ->where('name', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%"));
            });
        }

        $page = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $paginator = $query->paginate($perPage, ['*'], 'page', $page);
        $paginator->setCollection($paginator->getCollection()->map(fn (UploadedMedia $media): array => $this->mediaPayload($media)));

        return $paginator;
    }

    private function mediaPayload(UploadedMedia $media): array
    {
        return [
            'id' => $media->id,
            'name' => $media->original_name ?: $media->filename,
            'filename' => $media->filename,
            'original_name' => $media->original_name,
            'path' => $media->path,
            'url' => $media->url,
            'mime_type' => $media->mime_type,
            'type' => $media->type,
            'size' => $media->size,
            'extension' => $media->extension,
            'collection' => $media->collection,
            'last_modified' => $media->updated_at?->timestamp,
            'created_at' => $media->created_at,
            'user' => $media->user ? [
                'id' => $media->user->id,
                'name' => $media->user->name,
                'email' => $media->user->email,
                'role' => $media->user->role,
                'provider_profile' => $media->user->providerProfile ? [
                    'id' => $media->user->providerProfile->id,
                    'slug' => $media->user->providerProfile->slug,
                    'name' => $media->user->providerProfile->name,
                ] : null,
            ] : null,
        ];
    }

    private function mediaTableExists(): bool
    {
        return Schema::hasTable('uploaded_media');
    }

    private function syncStoredFilesToMediaRecords(): void
    {
        collect(Storage::disk($this->diskName())->files(self::UPLOAD_DIRECTORY))
            ->reject(fn (string $path): bool => basename($path) === '.htaccess')
            ->each(function (string $path): void {
                if (UploadedMedia::where('path', $path)->exists()) {
                    return;
                }

                $filename = basename($path);
                UploadedMedia::create([
                    'disk' => $this->diskName(),
                    'path' => $path,
                    'filename' => $filename,
                    'original_name' => $filename,
                    'mime_type' => Storage::disk($this->diskName())->mimeType($path),
                    'size' => Storage::disk($this->diskName())->size($path),
                    'extension' => strtolower(pathinfo($filename, PATHINFO_EXTENSION)),
                    'collection' => 'legacy_upload',
                ]);
            });
    }

    private function uniqueFilename(string $extension): string
    {
        return time().'-'.Str::random(24).'.'.$extension;
    }

    private function guardExecutableFile(UploadedFile $file): void
    {
        $extension = strtolower($file->getClientOriginalExtension());

        if (in_array($extension, self::BLOCKED_EXTENSIONS, true)) {
            throw ValidationException::withMessages([
                'file' => 'Executable files are not allowed.',
            ]);
        }
    }

    private function sanitizeUploadPath(string $path): string
    {
        $path = str_replace('\\', '/', trim($path));

        if (
            $path === ''
            || str_starts_with($path, '/')
            || str_contains($path, '..')
            || ! str_starts_with($path, self::UPLOAD_DIRECTORY.'/')
            || basename($path) === '.htaccess'
        ) {
            throw ValidationException::withMessages([
                'path' => 'Invalid media file path.',
            ]);
        }

        return $path;
    }

    private function ensureUploadDirectoryIsHardened(): void
    {
        $disk = $this->diskName();
        Storage::disk($disk)->makeDirectory(self::UPLOAD_DIRECTORY);

        if (config("filesystems.disks.{$disk}.driver") !== 'local') {
            return;
        }

        Storage::disk($disk)->put(self::UPLOAD_DIRECTORY.'/.htaccess', <<<'HTACCESS'
Options -Indexes
RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .cgi .pl .py .jsp .asp .aspx
RemoveType .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .cgi .pl .py .jsp .asp .aspx
<FilesMatch "\.(php|phtml|php3|php4|php5|php7|php8|phar|cgi|pl|py|jsp|asp|aspx|sh|bat|cmd|exe)$">
    Require all denied
</FilesMatch>
HTACCESS);
    }

    private function diskName(): string
    {
        return (string) config('filesystems.upload_disk', 'public');
    }
}
