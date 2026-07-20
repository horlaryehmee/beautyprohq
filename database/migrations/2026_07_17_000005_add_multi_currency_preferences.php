<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'preferred_currency')) {
                $table->char('preferred_currency', 3)->default('NGN')->after('role');
            }
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (! Schema::hasColumn('provider_profiles', 'default_currency')) {
                $table->char('default_currency', 3)->default('NGN')->after('location');
            }
        });

        Schema::table('services', function (Blueprint $table): void {
            if (! Schema::hasColumn('services', 'currency')) {
                $table->char('currency', 3)->default('NGN')->after('price');
            }
        });

        Schema::table('digital_products', function (Blueprint $table): void {
            if (! Schema::hasColumn('digital_products', 'currency')) {
                $table->char('currency', 3)->default('NGN')->after('price');
            }
        });
    }

    public function down(): void
    {
        Schema::table('digital_products', function (Blueprint $table): void {
            if (Schema::hasColumn('digital_products', 'currency')) {
                $table->dropColumn('currency');
            }
        });

        Schema::table('services', function (Blueprint $table): void {
            if (Schema::hasColumn('services', 'currency')) {
                $table->dropColumn('currency');
            }
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (Schema::hasColumn('provider_profiles', 'default_currency')) {
                $table->dropColumn('default_currency');
            }
        });

        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'preferred_currency')) {
                $table->dropColumn('preferred_currency');
            }
        });
    }
};
