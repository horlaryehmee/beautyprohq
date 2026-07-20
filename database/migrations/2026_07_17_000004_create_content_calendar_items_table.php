<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('content_calendar_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->date('scheduled_date')->index();
            $table->string('title');
            $table->string('channel')->nullable();
            $table->string('content_type')->nullable();
            $table->enum('status', ['idea', 'planned', 'created', 'posted'])->default('idea')->index();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_calendar_items');
    }
};
