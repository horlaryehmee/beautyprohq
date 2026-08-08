<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['news', 'events', 'community_posts'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName): void {
                if (! Schema::hasColumn($tableName, 'newsletter_notify_requested_at')) {
                    $table->timestamp('newsletter_notify_requested_at')->nullable()->after('published_at');
                }
                if (! Schema::hasColumn($tableName, 'newsletter_notified_at')) {
                    $table->timestamp('newsletter_notified_at')->nullable()->after('newsletter_notify_requested_at');
                }
                if (! Schema::hasColumn($tableName, 'newsletter_notified_count')) {
                    $table->unsignedInteger('newsletter_notified_count')->default(0)->after('newsletter_notified_at');
                }
            });
        }
    }

    public function down(): void
    {
        foreach (['news', 'events', 'community_posts'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName): void {
                foreach (['newsletter_notified_count', 'newsletter_notified_at', 'newsletter_notify_requested_at'] as $column) {
                    if (Schema::hasColumn($tableName, $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
