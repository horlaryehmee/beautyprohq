<?php

use App\Support\CurrencyResolver;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('provider_profiles', 'default_currency')) {
            return;
        }

        DB::table('provider_profiles')
            ->select(['id', 'default_currency'])
            ->orderBy('id')
            ->chunkById(200, function ($providers): void {
                foreach ($providers as $provider) {
                    $currency = strtoupper((string) ($provider->default_currency ?: config('currencies.default', 'NGN')));
                    $this->normalizePrices('services', (int) $provider->id, $currency);
                    $this->normalizePrices('digital_products', (int) $provider->id, $currency);
                }
            });
    }

    public function down(): void
    {
        // Currency normalization cannot be reversed without restoring historical exchange rates.
    }

    private function normalizePrices(string $table, int $providerId, string $currency): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'currency')) {
            return;
        }

        DB::table($table)
            ->where('provider_id', $providerId)
            ->where(function ($query) use ($currency): void {
                $query->whereNull('currency')->orWhere('currency', '!=', $currency);
            })
            ->orderBy('id')
            ->chunkById(200, function ($items) use ($table, $currency): void {
                foreach ($items as $item) {
                    $sourceCurrency = strtoupper((string) ($item->currency ?: config('currencies.default', 'NGN')));
                    DB::table($table)->where('id', $item->id)->update([
                        ...($item->price !== null ? ['price' => CurrencyResolver::convert((float) $item->price, $sourceCurrency, $currency)] : []),
                        'currency' => $currency,
                    ]);
                }
            });
    }
};
