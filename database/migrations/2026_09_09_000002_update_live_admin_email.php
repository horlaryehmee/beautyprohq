<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const LEGACY_EMAIL = 'admin@beautyprohq.test';

    private const LIVE_EMAIL = 'info@beautyprohq.com';

    public function up(): void
    {
        $adminId = DB::table('users')
            ->where('role', 'admin')
            ->where('email', self::LEGACY_EMAIL)
            ->value('id');

        if ($adminId === null) {
            return;
        }

        $existingUserId = DB::table('users')
            ->where('email', self::LIVE_EMAIL)
            ->value('id');

        if ($existingUserId !== null && (int) $existingUserId !== (int) $adminId) {
            throw new RuntimeException(self::LIVE_EMAIL.' already belongs to another user. The administrator email was not changed.');
        }

        DB::table('users')->where('id', $adminId)->update([
            'email' => self::LIVE_EMAIL,
            'email_verified_at' => now(),
            'pending_email' => null,
            'pending_email_token_hash' => null,
            'pending_email_expires_at' => null,
            'pending_email_change_context' => null,
            'login_email_changed_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        $adminId = DB::table('users')
            ->where('role', 'admin')
            ->where('email', self::LIVE_EMAIL)
            ->value('id');

        if ($adminId === null) {
            return;
        }

        $existingUserId = DB::table('users')
            ->where('email', self::LEGACY_EMAIL)
            ->value('id');

        if ($existingUserId !== null && (int) $existingUserId !== (int) $adminId) {
            throw new RuntimeException(self::LEGACY_EMAIL.' already belongs to another user. The administrator email was not reverted.');
        }

        DB::table('users')->where('id', $adminId)->update([
            'email' => self::LEGACY_EMAIL,
            'login_email_changed_at' => null,
            'updated_at' => now(),
        ]);
    }
};
