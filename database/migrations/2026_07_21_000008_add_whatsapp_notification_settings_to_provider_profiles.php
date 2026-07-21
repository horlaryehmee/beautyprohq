<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->string('whatsapp_number', 40)->nullable()->after('location');
            $table->boolean('whatsapp_notifications_enabled')->default(false)->after('whatsapp_number');
        });
    }

    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropColumn(['whatsapp_number', 'whatsapp_notifications_enabled']);
        });
    }
};
