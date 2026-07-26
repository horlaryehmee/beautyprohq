<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('app_settings')) {
            return;
        }

        DB::table('app_settings')->updateOrInsert(
            ['key' => 'features.coming_soon'],
            [
                'value' => '1',
                'encrypted' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        if (! Schema::hasTable('app_settings')) {
            return;
        }

        DB::table('app_settings')
            ->where('key', 'features.coming_soon')
            ->delete();
    }
};
