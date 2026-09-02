<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->where('is_guest', true)
            ->update(['email_verified_at' => null]);
    }

    public function down(): void
    {
        // Guest email ownership cannot be safely inferred, so this is intentionally irreversible.
    }
};
