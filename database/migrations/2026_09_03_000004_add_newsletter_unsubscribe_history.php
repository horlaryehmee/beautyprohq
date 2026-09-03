<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('newsletter_unsubscribes', function (Blueprint $table): void {
            $table->id();
            $table->string('email_hash', 64)->unique();
            $table->timestamp('unsubscribed_at')->index();
            $table->timestamps();
        });

        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("alter table announcements modify audience enum('all', 'provider', 'customer', 'subscribers') not null default 'all'");
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'mysql') {
            DB::statement("alter table announcements modify audience enum('all', 'provider', 'customer') not null default 'all'");
        }

        Schema::dropIfExists('newsletter_unsubscribes');
    }
};
