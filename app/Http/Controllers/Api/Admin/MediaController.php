<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\UploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MediaController extends Controller
{
    public function index(Request $request, UploadService $uploads): JsonResponse
    {
        $paginator = $uploads->paginate(
            $request->integer('page', 1),
            $this->perPage($request, 12, 60),
            $request->only(['type', 'collection', 'user_id', 'role', 'search']),
        );

        return $this->success($paginator->items(), meta: $this->paginationMeta($paginator));
    }

    public function store(Request $request, UploadService $uploads): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required_without:image', 'file', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx', 'max:12288'],
            'image' => ['required_without:file', 'file', 'mimes:jpg,jpeg,png,webp', 'max:12288'],
            'collection' => ['nullable', 'string', 'max:80'],
        ]);

        $file = $data['file'] ?? $data['image'];

        return $this->success($uploads->store($file, $request->user(), $data['collection'] ?? 'admin_media'), 'File uploaded.', 201);
    }

    public function destroy(Request $request, UploadService $uploads): JsonResponse
    {
        $data = $request->validate([
            'path' => ['required', 'string', 'max:255'],
        ]);

        $uploads->delete($data['path']);

        return $this->success(null, 'Media file deleted.');
    }
}
