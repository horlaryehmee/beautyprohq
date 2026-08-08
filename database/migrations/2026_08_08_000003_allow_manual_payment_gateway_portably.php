<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_accounts', function (Blueprint $table): void {
            $table->enum('gateway', ['paystack', 'stripe', 'paypal', 'manual'])->change();
        });
    }

    public function down(): void
    {
        DB::table('payment_accounts')->where('gateway', 'manual')->delete();

        Schema::table('payment_accounts', function (Blueprint $table): void {
            $table->enum('gateway', ['paystack', 'stripe', 'paypal'])->change();
        });
    }
};
