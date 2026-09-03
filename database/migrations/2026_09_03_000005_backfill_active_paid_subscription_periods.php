<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Repair demo/subscription records: an "active" paid plan with no renewal
     * or end period is treated as inactive by Subscription::isActive(), which
     * silently removes paid feature access even though the plan still shows
     * "active". Seed the missing renewal date to restore intended access.
     */
    public function up(): void
    {
        DB::table('subscriptions')
            ->whereIn('plan', ['paid', 'pro', 'daily_test'])
            ->where('status', 'active')
            ->whereNull('renews_at')
            ->whereNull('ends_at')
            ->update(['renews_at' => now()->addMonth()]);
    }

    public function down(): void
    {
        // The missing-value repair is not safely reversible (we cannot know the
        // original nulls from this update alone).
    }
};
