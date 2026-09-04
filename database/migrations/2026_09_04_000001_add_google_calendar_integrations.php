<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('provider_calendar_connections', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('provider_id')->unique()->constrained('provider_profiles')->cascadeOnDelete();
            $table->string('google_email')->nullable();
            $table->string('calendar_id')->default('primary');
            $table->text('access_token')->nullable();
            $table->text('refresh_token');
            $table->timestamp('access_token_expires_at')->nullable();
            $table->timestamp('connected_at');
            $table->timestamp('last_synced_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();
        });

        Schema::table('bookings', function (Blueprint $table): void {
            $table->string('google_calendar_event_id')->nullable()->index()->after('cancelled_at');
            $table->timestamp('google_calendar_synced_at')->nullable()->after('google_calendar_event_id');
            $table->text('google_calendar_sync_error')->nullable()->after('google_calendar_synced_at');
        });
    }

    public function down(): void
    {
        Schema::table('bookings', function (Blueprint $table): void {
            $table->dropIndex(['google_calendar_event_id']);
            $table->dropColumn(['google_calendar_event_id', 'google_calendar_synced_at', 'google_calendar_sync_error']);
        });

        Schema::dropIfExists('provider_calendar_connections');
    }
};
