<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('provider_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true)->index();
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
        });

        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->foreignId('provider_category_id')->nullable()->after('user_id')->constrained('provider_categories')->nullOnDelete();
        });

        $now = now();
        $categories = [
            'Makeup Artist',
            'Hairstylist',
            'Nail Technician',
            'Lash Technician',
            'Esthetician / Skin Specialist',
            'Barber',
            'Beauty Educator',
            'Photographer',
            'Videographer',
        ];

        foreach ($categories as $index => $name) {
            DB::table('provider_categories')->insert([
                'name' => $name,
                'slug' => str($name)->slug()->toString(),
                'sort_order' => $index + 1,
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        DB::table('provider_profiles')->orderBy('id')->chunkById(100, function ($profiles): void {
            foreach ($profiles as $profile) {
                $profession = strtolower((string) $profile->profession);
                $category = DB::table('provider_categories')
                    ->whereRaw('lower(name) = ?', [strtolower((string) $profile->profession)])
                    ->orWhere(function ($query) use ($profession): void {
                        if (str_contains($profession, 'makeup')) {
                            $query->where('slug', 'makeup-artist');
                        } elseif (str_contains($profession, 'hair')) {
                            $query->where('slug', 'hairstylist');
                        } elseif (str_contains($profession, 'nail')) {
                            $query->where('slug', 'nail-technician');
                        } elseif (str_contains($profession, 'lash')) {
                            $query->where('slug', 'lash-technician');
                        } elseif (str_contains($profession, 'skin') || str_contains($profession, 'esthetic')) {
                            $query->where('slug', 'esthetician-skin-specialist');
                        } elseif (str_contains($profession, 'barber')) {
                            $query->where('slug', 'barber');
                        } elseif (str_contains($profession, 'educator')) {
                            $query->where('slug', 'beauty-educator');
                        } elseif (str_contains($profession, 'photo')) {
                            $query->where('slug', 'photographer');
                        } elseif (str_contains($profession, 'video')) {
                            $query->where('slug', 'videographer');
                        }
                    })
                    ->value('id');

                if ($category) {
                    DB::table('provider_profiles')->where('id', $profile->id)->update(['provider_category_id' => $category]);
                }
            }
        }, 'id');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('provider_profiles', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('provider_category_id');
        });
        Schema::dropIfExists('provider_categories');
    }
};
