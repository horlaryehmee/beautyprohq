<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('announcements', function (Blueprint $table): void {
            $table->timestamp('notified_at')->nullable()->after('expires_at')->index();
        });

        DB::table('announcements')
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->update(['notified_at' => DB::raw('published_at')]);
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table): void {
            $table->dropColumn('notified_at');
        });
    }
};
