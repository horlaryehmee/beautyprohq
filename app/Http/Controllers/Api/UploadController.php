<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\UploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UploadController extends Controller
{
    public function __invoke(Request $request, UploadService $uploads): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx', 'max:12288'],
            'collection' => ['nullable', 'string', 'max:80'],
        ]);

        $collection = $data['collection'] ?? 'user_upload';
        if (in_array($collection, ['provider_verification_certification', 'provider_verification_license'], true)) {
            abort_unless($request->user()->isProvider(), 403, 'Only providers may upload verification documents.');

            return response()->json(
                $uploads->storeVerificationDocument($data['file'], $request->user(), $collection),
                201,
            );
        }

        return response()->json($uploads->store($data['file'], $request->user(), $collection), 201);
    }
}
