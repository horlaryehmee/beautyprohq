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
                'description' => "A Lagos fashion label is producing a two-day campaign shoot for a new ready-to-wear beauty editorial. The team needs makeup artists who can create polished skin, soft glam, and quick touch-ups across multiple looks.\n\nSelected artists will receive a creative brief, call sheet, and product direction before the shoot. Applicants should be comfortable working on set, collaborating with stylists and photographers, and maintaining clean hygiene standards throughout the day.",
                'contact_info' => ['email' => 'opportunities@beautyprohq.com', 'requirements' => "Portfolio link with at least 5 makeup looks\nAvailability for two full shoot days\nLagos-based or able to commute\nProfessional kit and hygiene setup", 'application_notes' => 'Apply with your role, portfolio, availability, location, and a short note about relevant campaign or bridal/editorial experience.'],
                'location' => 'Lagos',
                'deadline' => now()->addDays(21)->toDateString(),
            ],
            [
                'title' => 'Beauty Educator Masterclass Partnership',
                'type' => 'partnership',
                'description' => "BeautyPro HQ is looking for experienced beauty educators to co-host practical online masterclasses for early-career professionals. Topics may include pricing, client consultation, hygiene, content creation, business systems, portfolio building, or technical service delivery.\n\nThis is suitable for educators who can teach clearly, share real examples, and support learners with practical next steps.",
                'contact_info' => ['email' => 'partners@beautyprohq.com', 'requirements' => "Clear topic idea\nProof of teaching, training, or mentoring experience\nShort outline of what attendees will learn\nProfessional bio or profile link", 'application_notes' => 'Apply with your proposed topic, teaching background, and links that show your work or previous sessions.'],
                'location' => 'Remote',
                'deadline' => now()->addMonth()->toDateString(),
            ],
            [
                'title' => 'Nail Technicians for Pop-up Studio',
                'type' => 'vendor_call',
                'description' => "A weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, nail art, and consultation slots. The event is designed for beauty consumers who want quick, premium services from trusted professionals.\n\nSelected technicians should be able to manage timed appointments, maintain a clean station, and communicate service options clearly.",
                'contact_info' => ['email' => 'events@beautyprohq.com', 'requirements' => "Nail portfolio or Instagram page\nPreferred service menu with estimated timing\nOwn tools/kit\nAbuja-based availability for the event weekend", 'application_notes' => 'Apply with your portfolio, service menu, availability, and any event/pop-up experience.'],
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
