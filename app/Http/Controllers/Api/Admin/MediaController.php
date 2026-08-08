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
        );

        return $this->success($paginator->items(), meta: $this->paginationMeta($paginator));
    }

    public function store(Request $request, UploadService $uploads): JsonResponse
    {
        $data = $request->validate([
            'file' => ['required_without:image', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:2048'],
            'image' => ['required_without:file', 'file', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
        ]);

        $file = $data['file'] ?? $data['image'];

        return $this->success($uploads->store($file), 'File uploaded.', 201);
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
