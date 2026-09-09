<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->timestamp('provider_whatsapp_notified_at')->nullable()->after('cancelled_at');
            $table->timestamp('customer_whatsapp_confirmed_at')->nullable()->after('provider_whatsapp_notified_at');
            $table->timestamp('customer_whatsapp_reminded_at')->nullable()->after('customer_whatsapp_confirmed_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropColumn([
                'provider_whatsapp_notified_at',
                'customer_whatsapp_confirmed_at',
                'customer_whatsapp_reminded_at',
            ]);
        });
    }
};
