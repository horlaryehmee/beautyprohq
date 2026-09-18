<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->string('claim_token_hash', 64)->nullable();
            $table->timestamp('claim_expires_at')->nullable();
            $table->timestamp('claimed_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropColumn(['claim_token_hash', 'claim_expires_at', 'claimed_at']);
        });
    }
};
