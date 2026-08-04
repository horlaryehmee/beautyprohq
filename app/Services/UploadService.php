<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
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

        return collect(Storage::disk('public')->files(self::UPLOAD_DIRECTORY))
            ->reject(fn (string $path): bool => basename($path) === '.htaccess')
            ->map(fn (string $path): array => [
                'name' => basename($path),
                'path' => $path,
                'url' => Storage::disk('public')->url($path),
                'mime_type' => Storage::disk('public')->mimeType($path),
                'size' => Storage::disk('public')->size($path),
                'last_modified' => Storage::disk('public')->lastModified($path),
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

        Storage::disk('public')->put($path, (string) $encoded);

        return $this->storedPayload($path, $filename, (string) Storage::disk('public')->mimeType($path));
    }

    private function storeFile(UploadedFile $file): array
    {
        $extension = strtolower($file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'bin');
        $filename = $this->uniqueFilename($extension);
        $path = $file->storeAs(self::UPLOAD_DIRECTORY, $filename, 'public');

        return $this->storedPayload($path, $filename, (string) $file->getMimeType());
    }

    private function storedPayload(string $path, string $filename, string $mimeType): array
    {
        return [
            'success' => true,
            'url' => Storage::disk('public')->url($path),
            'path' => $path,
            'filename' => $filename,
            'mime_type' => $mimeType,
            'size' => Storage::disk('public')->size($path),
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

    private function ensureUploadDirectoryIsHardened(): void
    {
        Storage::disk('public')->makeDirectory(self::UPLOAD_DIRECTORY);
        Storage::disk('public')->put(self::UPLOAD_DIRECTORY.'/.htaccess', <<<'HTACCESS'
Options -Indexes
RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .cgi .pl .py .jsp .asp .aspx
RemoveType .php .phtml .php3 .php4 .php5 .php7 .php8 .phar .cgi .pl .py .jsp .asp .aspx
<FilesMatch "\.(php|phtml|php3|php4|php5|php7|php8|phar|cgi|pl|py|jsp|asp|aspx|sh|bat|cmd|exe)$">
    Require all denied
</FilesMatch>
HTACCESS);
    }
}
