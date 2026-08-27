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

        return response()->json($uploads->store($data['file'], $request->user(), $data['collection'] ?? 'user_upload'), 201);
    }
}
