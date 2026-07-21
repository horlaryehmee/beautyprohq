<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('two_factor_enabled')->default(false)->after('is_active');
            $table->timestamp('two_factor_confirmed_at')->nullable()->after('two_factor_enabled');
            $table->string('two_factor_code_hash')->nullable()->after('two_factor_confirmed_at');
            $table->timestamp('two_factor_code_expires_at')->nullable()->after('two_factor_code_hash');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn([
                'two_factor_enabled',
                'two_factor_confirmed_at',
                'two_factor_code_hash',
                'two_factor_code_expires_at',
            ]);
        });
    }
};
