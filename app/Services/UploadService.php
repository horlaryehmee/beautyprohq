<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Pagination\LengthAwarePaginator;
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

    public function store(UploadedFile $file): array
    {
        $this->guardExecutableFile($file);
        $this->ensureUploadDirectoryIsHardened();

        return str_starts_with((string) $file->getMimeType(), 'image/')
            ? $this->storeOptimizedImage($file)
            : $this->storeFile($file);
    }

    public function list(): array
    {
        $this->ensureUploadDirectoryIsHardened();

        return $this->files();
    }

    public function paginate(int $page = 1, int $perPage = 20): LengthAwarePaginator
    {
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
        $useWebp = function_exists('imagewebp');
        $extension = $useWebp ? 'webp' : 'jpg';
        $filename = $this->uniqueFilename($extension);
        $path = self::UPLOAD_DIRECTORY.'/'.$filename;

        $manager = new ImageManager(new Driver());
        $image = $manager->read($file->getRealPath())->scaleDown(width: 1200);
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
