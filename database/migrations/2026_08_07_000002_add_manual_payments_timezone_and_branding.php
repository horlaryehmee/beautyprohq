<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (! Schema::hasColumn('provider_profiles', 'timezone')) {
                $table->string('timezone')->default('Africa/Lagos')->after('default_payment_gateway');
            }
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE payment_accounts MODIFY gateway ENUM('paystack','stripe','paypal','manual') NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::table('payment_accounts')->where('gateway', 'manual')->delete();
            DB::statement("ALTER TABLE payment_accounts MODIFY gateway ENUM('paystack','stripe','paypal') NOT NULL");
        }

        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (Schema::hasColumn('provider_profiles', 'timezone')) {
                $table->dropColumn('timezone');
            }
        });
    }
};
