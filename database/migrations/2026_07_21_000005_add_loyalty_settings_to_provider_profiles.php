<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->boolean('loyalty_enabled')->default(false)->after('booking_form_fields');
            $table->unsignedInteger('loyalty_points_per_booking')->default(10)->after('loyalty_enabled');
            $table->unsignedInteger('loyalty_points_required')->default(100)->after('loyalty_points_per_booking');
        });
    }

    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropColumn(['loyalty_enabled', 'loyalty_points_per_booking', 'loyalty_points_required']);
        });
    }
};
