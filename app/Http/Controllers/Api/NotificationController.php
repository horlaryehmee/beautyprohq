<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Notifications\AnnouncementNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $visible = $this->visible($request->user()->notifications());
        $notifications = (clone $visible)
            ->latest()
            ->paginate($this->perPage($request, 20, 50));

        return $this->success($notifications->items(), meta: $this->paginationMeta($notifications) + [
            'unread_count' => (clone $visible)->whereNull('read_at')->count(),
        ]);
    }

    public function read(Request $request, string $id): JsonResponse
    {
        $notification = $request->user()->notifications()->findOrFail($id);
        $notification->markAsRead();

        return $this->success($notification->fresh(), 'Notification marked as read.');
    }

    public function readAll(Request $request): JsonResponse
    {
        $request->user()->unreadNotifications()->update(['read_at' => now()]);

        return $this->success(null, 'All notifications marked as read.');
    }

    public function clear(Request $request): JsonResponse
    {
        $request->user()->notifications()->delete();

        return $this->success(null, 'Notifications cleared.');
    }

    private function visible($query)
    {
        $activeAnnouncementIds = Announcement::active()->pluck('id');
        $cutoff = now()->subDays(30);

        return $query->where(function ($visible) use ($activeAnnouncementIds, $cutoff): void {
            $visible->where(function ($activity) use ($cutoff): void {
                $activity->where('type', '!=', AnnouncementNotification::class)
                    ->where('created_at', '>=', $cutoff);
            })->orWhere(function ($announcements) use ($activeAnnouncementIds): void {
                $announcements->where('type', AnnouncementNotification::class)
                    ->whereIn('data->announcement_id', $activeAnnouncementIds);
            });
        });
    }
}
