<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (! Schema::hasColumn('provider_profiles', 'account_declined_at')) {
                $table->timestamp('account_declined_at')->nullable()->after('account_approved_at')->index();
            }

            if (! Schema::hasColumn('provider_profiles', 'account_review_notes')) {
                $table->text('account_review_notes')->nullable()->after('account_declined_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (Schema::hasColumn('provider_profiles', 'account_review_notes')) {
                $table->dropColumn('account_review_notes');
            }

            if (Schema::hasColumn('provider_profiles', 'account_declined_at')) {
                $table->dropColumn('account_declined_at');
            }
        });
    }
};
