<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['news', 'events', 'opportunities'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->boolean('show_on_homepage')->default(true)->index();
                $table->unsignedInteger('homepage_order')->default(0)->index();
            });
        }

        Schema::create('homepage_settings', function (Blueprint $table): void {
            $table->string('section')->primary();
            $table->string('sort_mode')->default('custom');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('homepage_settings');

        foreach (['news', 'events', 'opportunities'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table): void {
                $table->dropColumn(['show_on_homepage', 'homepage_order']);
            });
        }
    }
};
