<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (! Schema::hasColumn('provider_profiles', 'referral_rewards_enabled')) {
                $table->boolean('referral_rewards_enabled')->default(false)->after('loyalty_reward_value_amount');
            }
            if (! Schema::hasColumn('provider_profiles', 'loyalty_referral_points')) {
                $table->unsignedInteger('loyalty_referral_points')->default(0)->after('referral_rewards_enabled');
            }
        });

        Schema::table('bookings', function (Blueprint $table): void {
            if (! Schema::hasColumn('bookings', 'referred_by_customer_id')) {
                $table->foreignId('referred_by_customer_id')->nullable()->after('customer_id')->constrained('users')->nullOnDelete();
                $table->index(['provider_id', 'referred_by_customer_id'], 'bookings_provider_referrer_index');
            }
            if (! Schema::hasColumn('bookings', 'referral_points_awarded_at')) {
                $table->timestamp('referral_points_awarded_at')->nullable()->after('referred_by_customer_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            if (Schema::hasColumn('bookings', 'referred_by_customer_id')) {
                $table->dropIndex('bookings_provider_referrer_index');
                $table->dropConstrainedForeignId('referred_by_customer_id');
            }
            if (Schema::hasColumn('bookings', 'referral_points_awarded_at')) {
                $table->dropColumn('referral_points_awarded_at');
            }
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            foreach (['loyalty_referral_points', 'referral_rewards_enabled'] as $column) {
                if (Schema::hasColumn('provider_profiles', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
