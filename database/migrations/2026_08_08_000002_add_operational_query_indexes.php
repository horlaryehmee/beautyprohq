<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->index(['provider_id', 'status', 'date'], 'bookings_provider_status_date_index');
        });

        Schema::table('payments', function (Blueprint $table): void {
            $table->index(['provider_id', 'status', 'created_at'], 'payments_provider_status_created_index');
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->index(['user_id', 'status', 'created_at'], 'subscriptions_user_status_created_index');
        });

        Schema::table('subscription_payments', function (Blueprint $table): void {
            $table->index(['user_id', 'status', 'created_at'], 'subscription_payments_user_status_created_index');
        });

        Schema::table('jobs', function (Blueprint $table): void {
            $table->index(['queue', 'reserved_at', 'available_at'], 'jobs_queue_reservation_available_index');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', fn (Blueprint $table) => $table->dropIndex('bookings_provider_status_date_index'));
        Schema::table('payments', fn (Blueprint $table) => $table->dropIndex('payments_provider_status_created_index'));
        Schema::table('subscriptions', fn (Blueprint $table) => $table->dropIndex('subscriptions_user_status_created_index'));
        Schema::table('subscription_payments', fn (Blueprint $table) => $table->dropIndex('subscription_payments_user_status_created_index'));
        Schema::table('jobs', fn (Blueprint $table) => $table->dropIndex('jobs_queue_reservation_available_index'));
    }
};
