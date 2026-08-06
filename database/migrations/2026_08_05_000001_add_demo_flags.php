<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach ([
            'users',
            'provider_profiles',
            'provider_categories',
            'services',
            'availability',
            'bookings',
            'reviews',
            'portfolio_items',
            'news',
            'events',
            'opportunities',
            'community_posts',
        ] as $table) {
            Schema::table($table, function (Blueprint $blueprint) use ($table): void {
                if (! Schema::hasColumn($table, 'is_demo')) {
                    $blueprint->boolean('is_demo')->default(false)->index()->after('id');
                }
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'community_posts',
            'opportunities',
            'events',
            'news',
            'portfolio_items',
            'reviews',
            'bookings',
            'availability',
            'services',
            'provider_categories',
            'provider_profiles',
            'users',
        ] as $table) {
            Schema::table($table, function (Blueprint $blueprint) use ($table): void {
                if (Schema::hasColumn($table, 'is_demo')) {
                    $blueprint->dropColumn('is_demo');
                }
            });
        }
    }
};
