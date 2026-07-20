<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->string('cover_image')->nullable()->after('profile_photo');
            $table->string('contact_email')->nullable()->after('location');
            $table->string('contact_phone', 40)->nullable()->after('contact_email');
            $table->string('website')->nullable()->after('contact_phone');
            $table->string('country')->nullable()->after('website')->index();
            $table->string('city')->nullable()->after('country')->index();
            $table->decimal('base_price', 12, 2)->nullable()->after('default_currency');
            $table->timestamp('terms_accepted_at')->nullable()->after('base_price');
            $table->timestamp('onboarding_completed_at')->nullable()->after('terms_accepted_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropColumn([
                'cover_image',
                'contact_email',
                'contact_phone',
                'website',
                'country',
                'city',
                'base_price',
                'terms_accepted_at',
                'onboarding_completed_at',
            ]);
        });
    }
};
