<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->unsignedBigInteger('wordpress_listing_id')->nullable()->unique();
            $table->json('listing_categories')->nullable();
            $table->string('service_zones')->nullable();
            $table->json('preferred_payment_methods')->nullable();
            $table->json('work_hours')->nullable();
            $table->json('wordpress_source_data')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropColumn(['wordpress_listing_id', 'listing_categories', 'service_zones', 'preferred_payment_methods', 'work_hours', 'wordpress_source_data']);
        });
    }
};
