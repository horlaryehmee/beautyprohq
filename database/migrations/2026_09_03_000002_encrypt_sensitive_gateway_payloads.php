<?php

use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_payments', function (Blueprint $table): void {
            $table->longText('secure_payload')->nullable();
        });
        if (DB::getDriverName() !== 'sqlite') {
            Schema::table('subscription_payments', fn (Blueprint $table) => $table->text('access_code')->nullable()->change());
        }

        DB::table('subscription_payments')->whereNotNull('access_code')->orderBy('id')->chunkById(100, function ($payments): void {
            foreach ($payments as $payment) {
                DB::table('subscription_payments')->where('id', $payment->id)->update([
                    'access_code' => Crypt::encryptString($payment->access_code),
                ]);
            }
        });
        Schema::table('subscriptions', function (Blueprint $table): void {
            $table->longText('secure_metadata')->nullable();
        });

        SubscriptionPayment::query()->whereNotNull('raw_response')->orderBy('id')->chunkById(100, function ($payments): void {
            foreach ($payments as $payment) {
                $payment->raw_response = $payment->raw_response;
                $payment->saveQuietly();
            }
        });

        Subscription::query()->whereNotNull('metadata')->orderBy('id')->chunkById(100, function ($subscriptions): void {
            foreach ($subscriptions as $subscription) {
                $subscription->metadata = $subscription->metadata;
                $subscription->saveQuietly();
            }
        });
    }

    public function down(): void
    {
        DB::table('subscription_payments')->whereNotNull('access_code')->orderBy('id')->chunkById(100, function ($payments): void {
            foreach ($payments as $payment) {
                DB::table('subscription_payments')->where('id', $payment->id)->update([
                    'access_code' => Crypt::decryptString($payment->access_code),
                ]);
            }
        });
        // Restore the full gateway response before dropping its encrypted copy.
        SubscriptionPayment::query()->whereNotNull('secure_payload')->orderBy('id')->chunkById(100, function ($payments): void {
            foreach ($payments as $payment) {
                $payment->setRawAttributes(array_replace($payment->getAttributes(), [
                    'raw_response' => json_encode($payment->secure_payload, JSON_UNESCAPED_SLASHES),
                ]));
                $payment->saveQuietly();
            }
        });
        Subscription::query()->whereNotNull('secure_metadata')->orderBy('id')->chunkById(100, function ($subscriptions): void {
            foreach ($subscriptions as $subscription) {
                $metadata = array_replace($subscription->metadata ?? [], $subscription->secure_metadata ?? []);
                $subscription->setRawAttributes(array_replace($subscription->getAttributes(), [
                    'metadata' => json_encode($metadata, JSON_UNESCAPED_SLASHES),
                ]));
                $subscription->saveQuietly();
            }
        });

        Schema::table('subscription_payments', fn (Blueprint $table) => $table->dropColumn('secure_payload'));
        Schema::table('subscriptions', fn (Blueprint $table) => $table->dropColumn('secure_metadata'));
        if (DB::getDriverName() !== 'sqlite') {
            Schema::table('subscription_payments', fn (Blueprint $table) => $table->string('access_code')->nullable()->change());
        }
    }
};
