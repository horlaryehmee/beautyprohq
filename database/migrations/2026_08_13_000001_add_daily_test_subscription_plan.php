<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('subscription_plans')->updateOrInsert(
            ['key' => 'daily_test'],
            [
                'name' => 'Daily Test Plan',
                'price' => 100,
                'currency' => 'NGN',
                'billing_period' => 'daily',
                'features' => json_encode([
                    'Daily recurring subscription for payment testing',
                    'Access to the same paid provider tools as Pro Plan',
                    'Useful for validating renewal and cancellation flows',
                ]),
                'is_active' => true,
                'sort_order' => 3,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
    }

    public function down(): void
    {
        DB::table('subscription_plans')->where('key', 'daily_test')->delete();
    }
};
