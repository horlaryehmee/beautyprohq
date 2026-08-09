<?php

namespace App\Http\Controllers\Api\Provider;

use App\Http\Controllers\Controller;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\PlatformUpdateNotification;
use App\Services\UploadService;
use App\Support\SafeHtml;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

class CommunityPostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $provider = $this->provider($request);

        $posts = CommunityPost::query()
            ->where('provider_id', $provider->id)
            ->latest()
            ->paginate($request->integer('per_page', 12));

        return $this->success(
            collect($posts->items())->map(fn (CommunityPost $post) => $this->payload($post))->values(),
            meta: $this->paginationMeta($posts)
        );
    }

    public function store(Request $request, UploadService $uploads): JsonResponse
    {
        $provider = $this->provider($request);

        $post = CommunityPost::create($this->data($request, false, $uploads) + [
            'provider_id' => $provider->id,
            'published_at' => null,
        ]);

        $this->notifyAdmins($post, $request->user()->name);

        return $this->success($this->payload($post->fresh()), 'Community post submitted for admin approval.', 201);
    }

    public function update(Request $request, CommunityPost $communityPost, UploadService $uploads): JsonResponse
    {
        $provider = $this->provider($request);
        abort_unless((int) $communityPost->provider_id === (int) $provider->id, 404);

        $data = $this->data($request, true, $uploads);
        $oldImage = $communityPost->image;
        $communityPost->update($data + ['published_at' => null]);
        if (array_key_exists('image', $data)) {
            $this->deleteStoredUpload($oldImage);
        }
        $this->notifyAdmins($communityPost->fresh(), $request->user()->name);

        return $this->success($this->payload($communityPost->fresh()), 'Community post updated and sent back for admin approval.');
    }

    public function destroy(Request $request, CommunityPost $communityPost): JsonResponse
    {
        $provider = $this->provider($request);
        abort_unless((int) $communityPost->provider_id === (int) $provider->id, 404);

        $this->deleteStoredUpload($communityPost->image);
        $communityPost->delete();

        return $this->success(null, 'Community post removed.');
    }

    private function data(Request $request, bool $partial, UploadService $uploads): array
    {
        $p = $partial ? 'sometimes' : 'required';

        $data = $request->validate([
            'title' => [$p, 'string', 'max:180'],
            'content' => [$p, 'string', 'min:80', 'max:20000'],
            'type' => ['nullable', 'string', 'max:80'],
            'topic' => ['nullable', 'string', 'max:100'],
            'group_name' => ['nullable', 'string', 'max:100'],
            'mentions' => ['nullable', 'array'],
            'mentions.*' => ['string', 'max:40'],
            'image' => ['nullable', 'string', 'max:500'],
            'image_file' => ['sometimes', 'nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        if ($request->hasFile('image_file')) {
            $data['image'] = $uploads->store($request->file('image_file'))['path'];
        }
        unset($data['image_file']);

        if (array_key_exists('content', $data)) {
            $data['content'] = SafeHtml::clean($data['content']);
        }

        if (array_key_exists('type', $data)) {
            $data['type'] = filled($data['type']) ? trim($data['type']) : 'community';
        } elseif (! $partial) {
            $data['type'] = 'community';
        }

        if (array_key_exists('topic', $data)) {
            $data['topic'] = filled($data['topic']) ? trim($data['topic']) : 'General';
        } elseif (! $partial) {
            $data['topic'] = 'General';
        }

        if (array_key_exists('group_name', $data)) {
            $data['group_name'] = filled($data['group_name']) ? trim($data['group_name']) : null;
        }

        if (array_key_exists('mentions', $data)) {
            $data['mentions'] = collect($data['mentions'] ?? [])
                ->filter()
                ->map(fn ($value) => Str::lower(ltrim(trim($value), '@')))
                ->unique()
                ->values()
                ->all();
        }

        return $data;
    }

    private function provider(Request $request)
    {
        $provider = $request->user()->providerProfile;
        abort_unless($provider, 422, 'Complete your provider profile before submitting community content.');

        return $provider;
    }

    private function payload(CommunityPost $post): array
    {
        return $post->toArray() + [
            'status' => $post->published_at && $post->published_at->lte(now()) ? 'published' : 'pending approval',
        ];
    }

    private function notifyAdmins(CommunityPost $post, string $providerName): void
    {
        try {
            Notification::send(
                User::where('role', 'admin')->where('is_active', true)->get(),
                new PlatformUpdateNotification(
                    'Community post awaiting approval',
                    "{$providerName} submitted \"{$post->title}\" for community review.",
                    'Review post',
                    rtrim(config('app.frontend_url', config('app.url')), '/').'/admin/content/community/'.$post->id.'/edit',
                    ['community_post_id' => $post->id]
                )
            );
        } catch (\Throwable $exception) {
            Log::warning('Community post approval notification failed.', [
                'community_post_id' => $post->id,
                'exception' => $exception::class,
            ]);
        }
    }

    private function deleteStoredUpload(?string $path): void
    {
        $path = str_replace('\\', '/', trim((string) $path));
        if ($path === '' || str_starts_with($path, '/') || str_contains($path, '..') || preg_match('#^https?://#i', $path)) {
            return;
        }

        Storage::disk((string) config('filesystems.upload_disk', 'public'))->delete(preg_replace('#^storage/#', '', $path));
    }
}
