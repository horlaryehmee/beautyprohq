<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('opportunities', function (Blueprint $table): void {
            if (! Schema::hasColumn('opportunities', 'newsletter_notify_requested_at')) {
                $table->timestamp('newsletter_notify_requested_at')->nullable()->after('published_at');
            }
            if (! Schema::hasColumn('opportunities', 'newsletter_notified_at')) {
                $table->timestamp('newsletter_notified_at')->nullable()->after('newsletter_notify_requested_at');
            }
            if (! Schema::hasColumn('opportunities', 'newsletter_notified_count')) {
                $table->unsignedInteger('newsletter_notified_count')->default(0)->after('newsletter_notified_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('opportunities', function (Blueprint $table): void {
            foreach (['newsletter_notified_count', 'newsletter_notified_at', 'newsletter_notify_requested_at'] as $column) {
                if (Schema::hasColumn('opportunities', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
