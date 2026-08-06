<?php

namespace App\Observers;

use App\Models\User;
use App\Services\MailchimpService;

class UserMailchimpObserver
{
    public function saved(User $user): void
    {
        if (! $user->wasRecentlyCreated && ! $user->wasChanged(['name', 'email', 'role', 'is_active'])) {
            return;
        }

        app(MailchimpService::class)->syncUser($user);
    }
}
