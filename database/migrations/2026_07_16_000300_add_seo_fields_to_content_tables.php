<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['news', 'events', 'community_posts'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->string('seo_title')->nullable()->after('image');
                $blueprint->text('seo_description')->nullable()->after('seo_title');
            });
        }
    }

    public function down(): void
    {
        foreach (['news', 'events', 'community_posts'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $blueprint->dropColumn(['seo_title', 'seo_description']);
            });
        }
    }
};
