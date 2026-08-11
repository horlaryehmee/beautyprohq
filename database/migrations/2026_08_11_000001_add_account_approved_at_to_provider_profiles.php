<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (! Schema::hasColumn('provider_profiles', 'account_approved_at')) {
                $table->timestamp('account_approved_at')->nullable()->after('onboarding_completed_at')->index();
            }
        });
    }

    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (Schema::hasColumn('provider_profiles', 'account_approved_at')) {
                $table->dropColumn('account_approved_at');
            }
        });
    }
};
