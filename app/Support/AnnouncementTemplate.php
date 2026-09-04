<?php

namespace App\Support;

use App\Models\AppSetting;
use App\Models\NewsletterSubscriber;
use Illuminate\Support\Str;

class AnnouncementTemplate
{
    public const TAGS = ['name', 'first_name', 'email', 'role', 'site_name'];

    public static function render(?string $template, object $recipient): string
    {
        $name = trim((string) ($recipient->name ?? ''));
        $values = [
            'name' => $name !== '' ? $name : 'there',
            'first_name' => $name !== '' ? Str::before($name, ' ') : 'there',
            'email' => trim((string) ($recipient->email ?? '')),
            'role' => $recipient instanceof NewsletterSubscriber
                ? 'Subscriber'
                : Str::headline((string) ($recipient->role ?? 'Member')),
            'site_name' => (string) AppSetting::getValue('branding.site_name', config('app.name', 'BeautyPro HQ')),
        ];

        return (string) preg_replace_callback(
            '/\{\{\s*('.implode('|', self::TAGS).')\s*\}\}/i',
            fn (array $matches): string => $values[Str::lower($matches[1])],
            (string) $template,
        );
    }
}
