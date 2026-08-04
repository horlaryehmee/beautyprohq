<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['news', 'events'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                if (! Schema::hasColumn($blueprint->getTable(), 'show_on_homepage')) {
                    $blueprint->boolean('show_on_homepage')->default(false)->after('seo_description');
                }

                if (! Schema::hasColumn($blueprint->getTable(), 'homepage_sort_order')) {
                    $blueprint->unsignedSmallInteger('homepage_sort_order')->nullable()->after('show_on_homepage');
                }
            });
        }
    }

    public function down(): void
    {
        foreach (['news', 'events'] as $table) {
            Schema::table($table, function (Blueprint $blueprint): void {
                $columns = collect(['show_on_homepage', 'homepage_sort_order'])
                    ->filter(fn (string $column): bool => Schema::hasColumn($blueprint->getTable(), $column))
                    ->all();

                if ($columns !== []) {
                    $blueprint->dropColumn($columns);
                }
            });
        }
    }
};
