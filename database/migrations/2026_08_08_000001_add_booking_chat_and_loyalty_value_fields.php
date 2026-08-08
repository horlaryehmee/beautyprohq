<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (! Schema::hasColumn('provider_profiles', 'loyalty_reward_value_amount')) {
                $table->decimal('loyalty_reward_value_amount', 12, 2)->default(0)->after('loyalty_points_required');
            }
        });

        Schema::table('live_chat_conversations', function (Blueprint $table): void {
            if (! Schema::hasColumn('live_chat_conversations', 'booking_id')) {
                $table->foreignId('booking_id')->nullable()->after('customer_id')->constrained('bookings')->nullOnDelete();
                $table->index(['customer_id', 'booking_id', 'status']);
            }
        });
    }

    public function down(): void
    {
        Schema::table('live_chat_conversations', function (Blueprint $table): void {
            if (Schema::hasColumn('live_chat_conversations', 'booking_id')) {
                $table->dropIndex(['customer_id', 'booking_id', 'status']);
                $table->dropConstrainedForeignId('booking_id');
            }
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            if (Schema::hasColumn('provider_profiles', 'loyalty_reward_value_amount')) {
                $table->dropColumn('loyalty_reward_value_amount');
            }
        });
    }
};
