<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('provider_profiles', 'account_approved_at')) {
            return;
        }

        DB::table('provider_profiles')
            ->join('users', 'users.id', '=', 'provider_profiles.user_id')
            ->where(function ($query): void {
                $query->where('provider_profiles.is_demo', true)
                    ->orWhere('users.is_demo', true)
                    ->orWhere('users.email', 'like', '%@beautyprohq.test');
            })
            ->whereNull('provider_profiles.account_approved_at')
            ->update([
                'provider_profiles.account_approved_at' => now(),
                'provider_profiles.account_declined_at' => null,
                'provider_profiles.updated_at' => now(),
            ]);
    }

    public function down(): void
    {
        //
    }
};
