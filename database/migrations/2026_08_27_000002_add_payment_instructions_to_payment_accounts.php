<?php

use App\Models\PaymentAccount;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_accounts', function (Blueprint $table): void {
            $table->text('payment_instructions')->nullable()->after('account_identifier');
        });

        PaymentAccount::query()->where('gateway', 'manual')->chunkById(100, function ($accounts): void {
            foreach ($accounts as $account) {
                $instructions = $account->settings['instructions'] ?? null;
                if (filled($instructions)) {
                    $account->forceFill(['payment_instructions' => $instructions])->save();
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('payment_accounts', function (Blueprint $table): void {
            $table->dropColumn('payment_instructions');
        });
    }
};
