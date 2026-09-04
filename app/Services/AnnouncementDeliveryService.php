<?php

namespace App\Services;

use App\Models\Announcement;
use App\Models\NewsletterSubscriber;
use App\Models\User;
use App\Notifications\AnnouncementNotification;

class AnnouncementDeliveryService
{
    public function sendDue(): int
    {
        $sent = 0;

        Announcement::query()
            ->whereNull('notified_at')
            ->active()
            ->orderBy('id')
            ->each(function (Announcement $announcement) use (&$sent): void {
                if ($this->send($announcement)) {
                    $sent++;
                }
            });

        return $sent;
    }

    public function send(Announcement $announcement): bool
    {
        if ($announcement->notified_at || ! $announcement->published_at?->lte(now()) || $announcement->expires_at?->lte(now())) {
            return false;
        }

        if ($announcement->audience === 'subscribers') {
            NewsletterSubscriber::query()
                ->whereNull('unsubscribed_at')
                ->chunkById(500, fn ($subscribers) => $subscribers->each->notify(new AnnouncementNotification($announcement)));
        } else {
            User::where('is_active', true)
                ->when($announcement->audience !== 'all', fn ($query) => $query->where('role', $announcement->audience))
                ->chunkById(500, fn ($users) => $users->each->notify(new AnnouncementNotification($announcement)));
        }

        $announcement->forceFill(['notified_at' => now()])->save();

        return true;
    }
}
