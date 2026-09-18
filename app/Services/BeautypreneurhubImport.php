<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\SubscriptionPlan;
use App\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use ZipArchive;

class BeautypreneurhubImport
{
    public const KEY = 'imports.beautypreneurhub.v1';

    public const FIELDS = ['wordpress_listing_id', 'imported_email', 'profession', 'bio', 'location', 'country', 'city', 'contact_email', 'contact_phone', 'website', 'social_links', 'listing_categories', 'service_zones', 'preferred_payment_methods', 'work_hours', 'default_currency', 'base_price', 'timezone', 'is_listed'];

    public function status(): array
    {
        $value = AppSetting::where('key', self::KEY)->value('value');

        return ['completed' => filled($value), 'result' => $value ? json_decode($value, true) : null];
    }

    public function export(string $path): int
    {
        $zip = new ZipArchive;
        if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Cannot create migration package.');
        }
        $listings = [];
        $media = [];
        foreach (ProviderProfile::with(['user', 'category', 'availability'])->whereNotNull('wordpress_listing_id')->orderBy('wordpress_listing_id')->get() as $profile) {
            $entry = Arr::only($profile->getAttributes(), self::FIELDS);
            foreach (self::FIELDS as $field) {
                $entry[$field] = $profile->getAttribute($field);
            }
            $entry['name'] = $profile->user->name;
            $entry['category'] = ['slug' => $profile->category?->slug ?? 'makeup-artist', 'name' => $profile->category?->name ?? 'Makeup Artist'];
            $entry['availability'] = $profile->availability->map(fn ($slot) => Arr::only($slot->getAttributes(), ['day_of_week', 'start_time', 'end_time', 'is_active']))->all();
            foreach (['profile_photo', 'cover_image'] as $field) {
                $source = $profile->getRawOriginal($field);
                $entry[$field] = null;
                if (! $source) {
                    continue;
                }
                if (! str_starts_with($source, 'imported/beautypreneurhub/') || ! Storage::disk('public')->exists($source)) {
                    throw new \RuntimeException('An imported listing image is missing or has been changed by its owner.');
                }
                $bytes = Storage::disk('public')->get($source);
                $hash = hash('sha256', $bytes);
                $name = 'media/'.$hash.'.'.strtolower(pathinfo($source, PATHINFO_EXTENSION));
                if (! isset($media[$name])) {
                    $zip->addFromString($name, $bytes);
                    $media[$name] = $hash;
                }
                $entry[$field] = $name;
            }
            $listings[] = $entry;
        }
        $zip->addFromString('manifest.json', json_encode(['source' => 'beautypreneurhub', 'version' => 1, 'listings' => $listings, 'media' => $media], JSON_THROW_ON_ERROR));
        $zip->close();

        return count($listings);
    }

    public function run(string $path, int $adminId): array
    {
        abort_if($this->status()['completed'], 409, 'Beautypreneurhub data has already been imported.');
        $zip = new ZipArchive;
        if ($zip->open($path) !== true) {
            throw ValidationException::withMessages(['package' => 'Choose a valid Beautypreneurhub migration ZIP.']);
        }
        try {
            $size = 0;
            for ($i = 0; $i < $zip->numFiles; $i++) {
                $size += $zip->statIndex($i)['size'];
            }
            if ($size > 100 * 1024 * 1024 || $zip->numFiles > 3000 || ($zip->statName('manifest.json')['size'] ?? PHP_INT_MAX) > 10 * 1024 * 1024) {
                throw ValidationException::withMessages(['package' => 'Migration package is too large or has no manifest.']);
            }
            $data = json_decode($zip->getFromName('manifest.json'), true);
            Validator::make(is_array($data) ? $data : [], [
                'source' => ['required', 'in:beautypreneurhub'], 'version' => ['required', 'in:1'],
                'media' => ['present', 'array'], 'listings' => ['required', 'array', 'min:1', 'max:2000'],
                'listings.*.wordpress_listing_id' => ['required', 'integer', 'min:1', 'distinct'],
                'listings.*.imported_email' => ['required', 'email', 'max:255'],
                'listings.*.name' => ['required', 'string', 'max:255'],
                'listings.*.profession' => ['required', 'string', 'max:255'],
                'listings.*.category.slug' => ['required', 'alpha_dash', 'max:180'],
                'listings.*.category.name' => ['required', 'string', 'max:180'],
                'listings.*.default_currency' => ['required', 'string', 'size:3'],
                'listings.*.base_price' => ['nullable', 'numeric', 'min:0', 'max:999999999'],
                'listings.*.is_listed' => ['required', 'boolean'],
                'listings.*.availability' => ['present', 'array', 'max:100'],
                'listings.*.availability.*.day_of_week' => ['required', 'integer', 'between:0,6'],
                'listings.*.availability.*.start_time' => ['required', 'date_format:H:i:s'],
                'listings.*.availability.*.end_time' => ['required', 'date_format:H:i:s', 'after:listings.*.availability.*.start_time'],
                'listings.*.availability.*.is_active' => ['required', 'boolean'],
            ])->validate();
            $images = [];
            foreach ($data['listings'] as $entry) {
                foreach (['profile_photo', 'cover_image'] as $field) {
                    $name = $entry[$field] ?? null;
                    if ($name === null || $name === '') {
                        continue;
                    }
                    if (is_string($name) && isset($images[$name])) {
                        continue;
                    }
                    if (! is_string($name) || ! preg_match('~^media/[a-f0-9]{64}\.(webp|png|jpg|jpeg)$~D', $name)
                        || ($zip->statName($name)['size'] ?? PHP_INT_MAX) > 10 * 1024 * 1024) {
                        throw ValidationException::withMessages(['package' => 'A listing image is missing or invalid.']);
                    }
                    $bytes = $zip->getFromName($name);
                    $info = @getimagesizefromstring($bytes);
                    if (! $info || ! in_array($info['mime'], ['image/webp', 'image/png', 'image/jpeg'], true)
                        || hash('sha256', $bytes) !== ($data['media'][$name] ?? null)
                        || pathinfo($name, PATHINFO_FILENAME) !== hash('sha256', $bytes)) {
                        throw ValidationException::withMessages(['package' => 'A listing image failed validation.']);
                    }
                    $images[$name] = $bytes;
                }
            }

            return DB::transaction(function () use ($data, $images, $adminId, $path): array {
                AppSetting::insertOrIgnore(['key' => self::KEY, 'value' => null, 'encrypted' => false, 'created_at' => now(), 'updated_at' => now()]);
                $marker = AppSetting::where('key', self::KEY)->lockForUpdate()->firstOrFail();
                abort_if(filled($marker->value), 409, 'Beautypreneurhub data has already been imported.');
                $result = ['created' => 0, 'preserved' => 0, 'total' => count($data['listings']), 'completed_at' => now()->toIso8601String(), 'admin_id' => $adminId, 'sha256' => hash_file('sha256', $path)];
                foreach ($images as $name => $bytes) {
                    if (! Storage::disk('public')->put('imported/beautypreneurhub/'.basename($name), $bytes)) {
                        throw new \RuntimeException('Could not save listing images. Retry after checking storage permissions.');
                    }
                }
                $free = SubscriptionPlan::where('key', 'free')->firstOrFail();
                // No imported account receives a usable shared password. Owners set their own via a verified claim.
                $unclaimedPassword = Hash::make(Str::random(128));
                foreach ($data['listings'] as $entry) {
                    // Existing listings, including claimed accounts, retain all live edits and access.
                    if (ProviderProfile::where('wordpress_listing_id', $entry['wordpress_listing_id'])->exists()) {
                        $result['preserved']++;

                        continue;
                    }
                    $email = Str::lower(trim($entry['imported_email']));
                    if (User::whereRaw('lower(email) = ?', [$email])->exists()) {
                        $email = 'wp-listing-'.$entry['wordpress_listing_id'].'-'.Str::lower(Str::random(12)).'@import.beautyprohq.invalid';
                    }
                    $user = User::withoutEvents(fn () => User::create(['name' => $entry['name'], 'email' => $email, 'password' => $unclaimedPassword, 'role' => 'provider', 'is_active' => true, 'is_demo' => false, 'is_guest' => false]));
                    $category = ProviderCategory::where('slug', $entry['category']['slug'])->orWhere('name', $entry['category']['name'])->first()
                        ?? ProviderCategory::create($entry['category'] + ['is_active' => true, 'is_demo' => false]);
                    $fields = Arr::only($entry, self::FIELDS);
                    $fields['imported_email'] = Str::lower(trim($entry['imported_email']));
                    $profile = $user->providerProfile()->create($fields + [
                        'slug' => 'wp-'.$entry['wordpress_listing_id'].'-'.Str::lower(Str::random(12)),
                        'provider_category_id' => $category->id, 'is_demo' => false,
                        'account_approved_at' => $entry['is_listed'] ? now() : null,
                        'profile_photo' => empty($entry['profile_photo']) ? null : 'imported/beautypreneurhub/'.basename($entry['profile_photo']),
                        'cover_image' => empty($entry['cover_image']) ? null : 'imported/beautypreneurhub/'.basename($entry['cover_image']),
                    ]);
                    foreach ($entry['availability'] as $slot) {
                        $profile->availability()->create(Arr::only($slot, ['day_of_week', 'start_time', 'end_time', 'is_active']) + ['is_demo' => false]);
                    }
                    $user->subscriptions()->create(['subscription_plan_id' => $free->id, 'plan' => 'free', 'status' => 'active', 'starts_at' => now(), 'amount' => 0, 'currency' => $free->currency]);
                    $result['created']++;
                }
                $marker->update(['value' => json_encode($result, JSON_THROW_ON_ERROR)]);

                return $result;
            });
        } finally {
            $zip->close();
        }
    }
}
