<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('contact_enquiries', function (Blueprint $table) {
            $table->foreignId('provider_id')->nullable()->after('user_id')->constrained('provider_profiles')->nullOnDelete();
            $table->index(['provider_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::table('contact_enquiries', function (Blueprint $table) {
            $table->dropIndex(['provider_id', 'status']);
            $table->dropConstrainedForeignId('provider_id');
        });
    }
};
