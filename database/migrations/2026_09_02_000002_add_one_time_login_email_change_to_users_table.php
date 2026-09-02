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
            $table->timestamp('login_email_changed_at')->nullable()->after('pending_email_expires_at');
        });

        DB::table('users')->where('role', '!=', 'admin')->update([
            'pending_email' => null,
            'pending_email_token_hash' => null,
            'pending_email_expires_at' => null,
        ]);

        DB::table('users')
            ->where('role', 'admin')
            ->where('email', 'not like', '%.test')
            ->update(['login_email_changed_at' => now()]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('login_email_changed_at');
        });
    }
};
