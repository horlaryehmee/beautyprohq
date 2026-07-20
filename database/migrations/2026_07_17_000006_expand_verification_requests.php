<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('verification_requests', function (Blueprint $table): void {
            if (! Schema::hasColumn('verification_requests', 'professional_info')) {
                $table->text('professional_info')->nullable()->after('certification_files');
            }
            if (! Schema::hasColumn('verification_requests', 'social_links')) {
                $table->json('social_links')->nullable()->after('professional_info');
            }
            if (! Schema::hasColumn('verification_requests', 'license_files')) {
                $table->json('license_files')->nullable()->after('social_links');
            }
        });
    }

    public function down(): void
    {
        Schema::table('verification_requests', function (Blueprint $table): void {
            foreach (['license_files', 'social_links', 'professional_info'] as $column) {
                if (Schema::hasColumn('verification_requests', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
