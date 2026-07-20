<?php

namespace Database\Seeders;

use App\Models\CommunityPost;
use App\Models\Opportunity;
use App\Models\ProviderProfile;
use Illuminate\Database\Seeder;

class LiveContentSeeder extends Seeder
{
    public function run(): void
    {
        $opportunities = [
            [
                'title' => 'Makeup Artists for Fashion Campaign',
                'type' => 'job',
                'description' => 'A Lagos fashion label needs experienced makeup artists for a two-day campaign shoot. Portfolio links and availability are required.',
                'contact_info' => ['email' => 'opportunities@beautyprohq.com', 'text' => 'Send portfolio and availability by email.'],
                'location' => 'Lagos',
                'deadline' => now()->addDays(21)->toDateString(),
            ],
            [
                'title' => 'Beauty Educator Masterclass Partnership',
                'type' => 'partnership',
                'description' => 'BeautyPro HQ is looking for educators to co-host practical online sessions for early-career beauty professionals.',
                'contact_info' => ['email' => 'partners@beautyprohq.com', 'text' => 'Share your topic idea and teaching experience.'],
                'location' => 'Remote',
                'deadline' => now()->addMonth()->toDateString(),
            ],
            [
                'title' => 'Nail Technicians for Pop-up Studio',
                'type' => 'vendor_call',
                'description' => 'A weekend beauty pop-up needs nail technicians with clean portfolio examples and strong client-care standards.',
                'contact_info' => ['email' => 'events@beautyprohq.com', 'text' => 'Apply with your portfolio and preferred service menu.'],
                'location' => 'Abuja',
                'deadline' => now()->addDays(14)->toDateString(),
            ],
        ];

        foreach ($opportunities as $opportunity) {
            Opportunity::updateOrCreate(
                ['title' => $opportunity['title']],
                $opportunity + ['published_at' => now()],
            );
        }

        $providers = ProviderProfile::query()
            ->where('is_listed', true)
            ->with('user:id,name')
            ->orderByDesc('is_pro_of_week')
            ->orderByDesc('verified')
            ->limit(3)
            ->get();

        $fallbackImages = [
            'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=80',
            'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80',
        ];

        $posts = [
            [
                'title' => 'From home studio to growing beauty brand',
                'content' => 'A BeautyPro HQ member shares how clear pricing, consistent client communication, and a strong portfolio helped turn a small home studio into a growing beauty business.',
                'type' => 'story',
            ],
            [
                'title' => 'Pro spotlight: building trust through great client care',
                'content' => 'This spotlight highlights the systems beauty professionals use to make clients feel prepared, comfortable, and confident before every appointment.',
                'type' => 'spotlight',
            ],
            [
                'title' => 'Community win: more beauty professionals getting discovered',
                'content' => 'Beauty professionals across the community are improving their profiles, sharing their work, and creating more visible paths for customers to find trusted services.',
                'type' => 'community',
            ],
        ];

        foreach ($posts as $index => $post) {
            $provider = $providers->get($index);
            CommunityPost::updateOrCreate(
                ['title' => $post['title']],
                $post + [
                    'provider_id' => $provider?->id,
                    'image' => $provider?->profile_photo ?: $fallbackImages[$index],
                    'published_at' => now()->subDays($index + 1),
                ],
            );
        }

        $this->command?->info('Live opportunities and community posts seeded.');
    }
}
