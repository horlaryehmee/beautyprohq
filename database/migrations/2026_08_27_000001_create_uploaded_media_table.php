<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('uploaded_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('disk')->default('public')->index();
            $table->string('path')->unique();
            $table->string('filename');
            $table->string('original_name')->nullable();
            $table->string('mime_type')->nullable()->index();
            $table->unsignedBigInteger('size')->default(0);
            $table->string('extension', 20)->nullable()->index();
            $table->string('collection')->nullable()->index();
            $table->timestamps();

            $table->index(['user_id', 'created_at']);
            $table->index(['collection', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uploaded_media');
    }
};
