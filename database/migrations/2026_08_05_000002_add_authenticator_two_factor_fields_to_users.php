<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('two_factor_method', 20)->default('email')->after('two_factor_enabled');
            $table->text('two_factor_totp_secret')->nullable()->after('two_factor_code_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'two_factor_method',
                'two_factor_totp_secret',
            ]);
        });
    }
};
