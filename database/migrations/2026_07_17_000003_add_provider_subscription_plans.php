<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_plans', function (Blueprint $table): void {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->decimal('price', 12, 2)->default(0);
            $table->string('currency', 3)->default('NGN');
            $table->string('billing_period')->default('monthly');
            $table->json('features')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->foreignId('subscription_plan_id')->nullable()->after('user_id')->constrained('subscription_plans')->nullOnDelete();
            $table->decimal('amount', 12, 2)->default(0)->after('status');
            $table->string('currency', 3)->default('NGN')->after('amount');
            $table->timestamp('renews_at')->nullable()->after('starts_at');
            $table->timestamp('cancelled_at')->nullable()->after('ends_at');
            $table->json('metadata')->nullable()->after('cancelled_at');
        });

        Schema::create('subscription_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subscription_plan_id')->nullable()->constrained('subscription_plans')->nullOnDelete();
            $table->foreignId('subscription_id')->nullable()->constrained()->nullOnDelete();
            $table->string('gateway')->default('paystack');
            $table->string('reference')->unique();
            $table->decimal('amount', 12, 2);
            $table->string('currency', 3)->default('NGN');
            $table->enum('status', ['pending', 'paid', 'failed', 'cancelled'])->default('pending')->index();
            $table->string('authorization_url')->nullable();
            $table->string('access_code')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->json('raw_response')->nullable();
            $table->timestamps();
        });

        DB::table('subscription_plans')->insert([
            [
                'key' => 'free',
                'name' => 'Free Plan',
                'price' => 0,
                'currency' => 'NGN',
                'billing_period' => 'monthly',
                'features' => json_encode(['Basic directory listing', 'Receive client reviews', 'Email notifications for account activity']),
                'is_active' => true,
                'sort_order' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'key' => 'paid',
                'name' => 'Pro Plan',
                'price' => 15000,
                'currency' => 'NGN',
                'billing_period' => 'monthly',
                'features' => json_encode(['CRM and customer management', 'Loyalty points and reward tracking', 'Direct booking requests', 'Payment gateway connection', 'External store and digital product links', 'Monthly content calendar', 'Upgrade or downgrade anytime']),
                'is_active' => true,
                'sort_order' => 2,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $freePlanId = DB::table('subscription_plans')->where('key', 'free')->value('id');
        $paidPlan = DB::table('subscription_plans')->where('key', 'paid')->first();
        DB::table('subscriptions')->whereIn('plan', ['paid', 'pro'])->update([
            'subscription_plan_id' => $paidPlan->id,
            'plan' => 'paid',
            'amount' => $paidPlan->price,
            'currency' => $paidPlan->currency,
            'renews_at' => now()->addMonth(),
        ]);
        DB::table('subscriptions')->whereNull('subscription_plan_id')->update([
            'subscription_plan_id' => $freePlanId,
            'amount' => 0,
            'currency' => 'NGN',
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payments');
        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('subscription_plan_id');
            $table->dropColumn(['amount', 'currency', 'renews_at', 'cancelled_at', 'metadata']);
        });
        Schema::dropIfExists('subscription_plans');
    }
};
