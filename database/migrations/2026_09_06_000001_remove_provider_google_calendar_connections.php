<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('provider_calendar_connections')) {
            DB::table('provider_calendar_connections')->delete();
        }
    }

    public function down(): void
    {
        // Deleted OAuth credentials cannot and should not be restored.
    }
};
