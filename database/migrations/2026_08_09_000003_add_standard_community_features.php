<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('community_posts', function (Blueprint $table): void {
            $table->string('topic')->default('General')->after('type')->index();
            $table->string('group_name')->nullable()->after('topic')->index();
            $table->json('mentions')->nullable()->after('group_name');
            $table->json('rules')->nullable()->after('mentions');
            $table->unsignedInteger('reaction_count')->default(0)->after('rules');
            $table->unsignedInteger('comment_count')->default(0)->after('reaction_count');
            $table->unsignedInteger('share_count')->default(0)->after('comment_count');
            $table->unsignedInteger('report_count')->default(0)->after('share_count');
        });

        Schema::create('community_reactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('community_post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('type', 30)->default('like');
            $table->timestamps();
            $table->unique(['community_post_id', 'user_id']);
            $table->index(['community_post_id', 'type']);
        });

        Schema::create('community_comments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('community_post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('community_comments')->cascadeOnDelete();
            $table->text('body');
            $table->json('mentions')->nullable();
            $table->enum('status', ['visible', 'hidden'])->default('visible')->index();
            $table->timestamps();
            $table->index(['community_post_id', 'parent_id', 'status']);
        });

        Schema::create('community_shares', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('community_post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('channel', 40)->default('copy_link');
            $table->string('ip_hash', 64)->nullable();
            $table->timestamps();
            $table->index(['community_post_id', 'created_at']);
        });

        Schema::create('community_reports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('community_post_id')->constrained()->cascadeOnDelete();
            $table->foreignId('community_comment_id')->nullable()->constrained('community_comments')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reason', 80);
            $table->text('details')->nullable();
            $table->enum('status', ['new', 'reviewing', 'resolved', 'dismissed'])->default('new')->index();
            $table->timestamps();
            $table->index(['community_post_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('community_reports');
        Schema::dropIfExists('community_shares');
        Schema::dropIfExists('community_comments');
        Schema::dropIfExists('community_reactions');

        Schema::table('community_posts', function (Blueprint $table): void {
            $table->dropColumn([
                'topic',
                'group_name',
                'mentions',
                'rules',
                'reaction_count',
                'comment_count',
                'share_count',
                'report_count',
            ]);
        });
    }
};
