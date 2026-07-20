<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('provider_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('slug')->unique();
            $table->string('profession')->nullable()->index();
            $table->text('bio')->nullable();
            $table->string('location')->nullable()->index();
            $table->boolean('verified')->default(false)->index();
            $table->boolean('is_listed')->default(true)->index();
            $table->boolean('is_pro_of_week')->default(false)->index();
            $table->decimal('rating', 3, 2)->default(0)->index();
            $table->unsignedInteger('review_count')->default(0);
            $table->string('profile_photo')->nullable();
            $table->json('social_links')->nullable();
            $table->json('portfolio_links')->nullable();
            $table->json('digital_product_links')->nullable();
            $table->unsignedBigInteger('profile_views')->default(0);
            $table->timestamps();
        });

        Schema::create('services', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->string('name');
            $table->string('category')->nullable()->index();
            $table->string('service_type')->default('in_person')->index();
            $table->decimal('price', 12, 2);
            $table->unsignedSmallInteger('duration_minutes')->default(60);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->timestamps();
            $table->index(['provider_id', 'is_active']);
        });

        Schema::create('availability', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->unsignedTinyInteger('day_of_week');
            $table->time('start_time');
            $table->time('end_time');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['provider_id', 'day_of_week', 'start_time', 'end_time'], 'availability_slot_unique');
        });

        Schema::create('blocked_dates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->date('date');
            $table->time('start_time')->nullable();
            $table->time('end_time')->nullable();
            $table->string('reason')->nullable();
            $table->timestamps();
            $table->index(['provider_id', 'date']);
        });

        Schema::create('bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('service_id')->constrained()->restrictOnDelete();
            $table->date('date')->index();
            $table->time('time');
            $table->time('end_time')->nullable();
            $table->enum('status', ['pending', 'confirmed', 'completed', 'cancelled', 'rejected'])->default('pending')->index();
            $table->text('notes')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();
            $table->index(['provider_id', 'date', 'time']);
            $table->index(['customer_id', 'status']);
        });

        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->nullable()->unique()->constrained()->nullOnDelete();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->text('comment')->nullable();
            $table->boolean('is_approved')->default(true)->index();
            $table->timestamps();
            $table->index(['provider_id', 'is_approved']);
        });

        Schema::create('portfolio_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('media_url');
            $table->string('media_type')->default('image');
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::create('crm_customers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('users')->cascadeOnDelete();
            $table->text('notes')->nullable();
            $table->json('tags')->nullable();
            $table->timestamp('last_service_at')->nullable();
            $table->timestamps();
            $table->unique(['provider_id', 'customer_id']);
        });

        Schema::create('loyalties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->integer('points')->default(0);
            $table->unsignedInteger('lifetime_points')->default(0);
            $table->timestamps();
            $table->unique(['customer_id', 'provider_id']);
        });

        Schema::create('loyalty_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('loyalty_id')->constrained()->cascadeOnDelete();
            $table->foreignId('booking_id')->nullable()->constrained()->nullOnDelete();
            $table->integer('points');
            $table->string('reason')->nullable();
            $table->timestamps();
        });

        Schema::create('rewards', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->unsignedInteger('points_required');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('booking_id')->unique()->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->char('currency', 3)->default('NGN');
            $table->enum('status', ['pending', 'processing', 'paid', 'failed', 'refunded'])->default('pending')->index();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->string('gateway')->nullable();
            $table->string('reference')->nullable()->unique();
            $table->json('metadata')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();
        });

        Schema::create('payment_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->enum('gateway', ['paystack', 'stripe', 'paypal']);
            $table->string('account_reference')->nullable();
            $table->string('account_name')->nullable();
            $table->string('account_identifier')->nullable();
            $table->string('public_key')->nullable();
            $table->longText('settings')->nullable();
            $table->boolean('is_connected')->default(false);
            $table->boolean('enabled')->default(false);
            $table->timestamps();
            $table->unique(['provider_id', 'gateway']);
        });

        Schema::create('verification_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->json('portfolio_links')->nullable();
            $table->json('certification_files')->nullable();
            $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending')->index();
            $table->text('admin_notes')->nullable();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('digital_products', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->string('name');
            $table->text('description')->nullable();
            $table->decimal('price', 12, 2)->nullable();
            $table->string('url');
            $table->string('image')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('saved_providers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['customer_id', 'provider_id']);
        });

        Schema::create('profile_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('provider_id')->constrained('provider_profiles')->cascadeOnDelete();
            $table->foreignId('viewer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('session_id')->nullable();
            $table->date('viewed_on')->index();
            $table->timestamps();
            $table->index(['provider_id', 'viewed_on']);
        });
    }

    public function down(): void
    {
        foreach (['profile_views', 'saved_providers', 'digital_products', 'verification_requests', 'payment_accounts', 'payments', 'rewards', 'loyalty_transactions', 'loyalties', 'crm_customers', 'portfolio_items', 'reviews', 'bookings', 'blocked_dates', 'availability', 'services', 'provider_profiles'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
