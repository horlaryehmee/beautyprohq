<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UploadedMedia;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MediaDownloadController extends Controller
{
    public function __invoke(Request $request, UploadedMedia $media): BinaryFileResponse|StreamedResponse
    {
        abort_unless(
            $request->user()->isAdmin() || (int) $media->user_id === (int) $request->user()->id,
            404
        );
        abort_unless($media->disk === 'verification', 404);

        $disk = Storage::disk($media->disk);
        abort_unless($disk->exists($media->path), 404);

        $filename = $this->downloadFilename($media);
        $headers = [
            'Content-Type' => $media->mime_type ?: 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'no-store, private, max-age=0',
            'Pragma' => 'no-cache',
            'Referrer-Policy' => 'no-referrer',
        ];

        if (method_exists($disk, 'path')) {
            $absolutePath = $disk->path($media->path);
            if (is_file($absolutePath) && is_readable($absolutePath)) {
                return response()
                    ->file($absolutePath, $headers)
                    ->setContentDisposition(ResponseHeaderBag::DISPOSITION_INLINE, $filename);
            }
        }

        $stream = $disk->readStream($media->path);
        abort_unless(is_resource($stream), 404);

        return response()->streamDownload(function () use ($stream): void {
            try {
                fpassthru($stream);
            } finally {
                fclose($stream);
            }
        }, $filename, $headers);
    }

    private function downloadFilename(UploadedMedia $media): string
    {
        $filename = preg_replace('/[^A-Za-z0-9._ -]/', '_', $media->original_name ?: $media->filename);
        $filename = trim((string) $filename, " .\t\n\r\0\x0B");

        return $filename !== '' ? $filename : 'verification-document';
    }
}
