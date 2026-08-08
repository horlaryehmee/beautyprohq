<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('community_posts', 'slug')) {
            return;
        }

        Schema::table('community_posts', function (Blueprint $table): void {
            $table->string('slug')->nullable()->after('title');
        });

        DB::table('community_posts')
            ->select(['id', 'title', 'slug'])
            ->orderBy('id')
            ->get()
            ->each(function (object $post): void {
                $base = Str::slug($post->slug ?: $post->title) ?: 'community-story';
                $slug = $base;
                $counter = 1;

                while (
                    DB::table('community_posts')
                        ->where('slug', $slug)
                        ->where('id', '<>', $post->id)
                        ->exists()
                ) {
                    $slug = $base.'-'.$counter++;
                }

                DB::table('community_posts')->where('id', $post->id)->update(['slug' => $slug]);
            });

        Schema::table('community_posts', function (Blueprint $table): void {
            $table->unique('slug');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('community_posts', 'slug')) {
            return;
        }

        Schema::table('community_posts', function (Blueprint $table): void {
            $table->dropUnique(['slug']);
            $table->dropColumn('slug');
        });
    }
};
