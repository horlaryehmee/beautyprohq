<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->index(['role', 'created_at'], 'users_role_created_at_index');
            $table->index(['created_at', 'id'], 'users_created_at_id_index');
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->index(['status', 'created_at'], 'bookings_status_created_at_index');
            $table->index(['created_at', 'id'], 'bookings_created_at_id_index');
        });

        Schema::table('payments', function (Blueprint $table): void {
            $table->index(['status', 'created_at'], 'payments_status_created_at_index');
            $table->index(['created_at', 'id'], 'payments_created_at_id_index');
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->index(['status', 'created_at'], 'subscriptions_status_created_at_index');
            $table->index(['created_at', 'id'], 'subscriptions_created_at_id_index');
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->index(['is_listed', 'updated_at'], 'provider_profiles_is_listed_updated_at_index');
            $table->index(['updated_at', 'id'], 'provider_profiles_updated_at_id_index');
        });

        Schema::table('news', function (Blueprint $table): void {
            $table->index(['published_at', 'created_at'], 'news_published_created_at_index');
            $table->index(['created_at', 'id'], 'news_created_at_id_index');
        });

        Schema::table('events', function (Blueprint $table): void {
            $table->index(['published_at', 'created_at'], 'events_published_created_at_index');
            $table->index(['created_at', 'id'], 'events_created_at_id_index');
        });

        Schema::table('announcements', function (Blueprint $table): void {
            $table->index(['audience', 'created_at'], 'announcements_audience_created_at_index');
            $table->index(['created_at', 'id'], 'announcements_created_at_id_index');
        });
    }

    public function down(): void
    {
        Schema::table('announcements', function (Blueprint $table): void {
            $table->dropIndex('announcements_audience_created_at_index');
            $table->dropIndex('announcements_created_at_id_index');
        });

        Schema::table('events', function (Blueprint $table): void {
            $table->dropIndex('events_published_created_at_index');
            $table->dropIndex('events_created_at_id_index');
        });

        Schema::table('news', function (Blueprint $table): void {
            $table->dropIndex('news_published_created_at_index');
            $table->dropIndex('news_created_at_id_index');
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropIndex('provider_profiles_is_listed_updated_at_index');
            $table->dropIndex('provider_profiles_updated_at_id_index');
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->dropIndex('subscriptions_status_created_at_index');
            $table->dropIndex('subscriptions_created_at_id_index');
        });

        Schema::table('payments', function (Blueprint $table): void {
            $table->dropIndex('payments_status_created_at_index');
            $table->dropIndex('payments_created_at_id_index');
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex('bookings_status_created_at_index');
            $table->dropIndex('bookings_created_at_id_index');
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex('users_role_created_at_index');
            $table->dropIndex('users_created_at_id_index');
        });
    }
};
