<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('crm_customers', function (Blueprint $table) {
            $table->string('stage')->default('customer')->index();
            $table->string('source')->nullable()->index();
            $table->string('priority')->default('normal')->index();
            $table->string('support_status')->default('none')->index();
            $table->timestamp('next_follow_up_at')->nullable()->index();
        });

        Schema::create('crm_activities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('crm_customer_id')->constrained('crm_customers')->cascadeOnDelete();
            $table->string('type')->index();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status')->default('open')->index();
            $table->timestamp('due_at')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crm_activities');

        Schema::table('crm_customers', function (Blueprint $table) {
            $table->dropColumn(['stage', 'source', 'priority', 'support_status', 'next_follow_up_at']);
        });
    }
};
