<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('pending_email_change_context', 40)->nullable()->after('pending_email_expires_at');
        });

        DB::table('users')
            ->where('role', 'admin')
            ->whereNotNull('pending_email')
            ->update(['pending_email_change_context' => 'admin_self']);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('pending_email_change_context');
        });
    }
};
