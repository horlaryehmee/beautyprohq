<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->json('booking_form_fields')->nullable()->after('digital_product_links');
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->json('custom_fields')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropColumn('custom_fields');
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropColumn('booking_form_fields');
        });
    }
};
