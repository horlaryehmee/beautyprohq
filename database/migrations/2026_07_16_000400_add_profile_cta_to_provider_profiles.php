<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table) {
            $table->string('profile_cta_label')->default('Digital product')->after('digital_product_links');
            $table->string('profile_cta_url', 1000)->nullable()->after('profile_cta_label');
        });
    }

    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table) {
            $table->dropColumn(['profile_cta_label', 'profile_cta_url']);
        });
    }
};
