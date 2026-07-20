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
                'description' => "About the opportunity\n\nA Lagos fashion label is producing a two-day campaign shoot for a new ready-to-wear beauty editorial. The campaign will feature multiple models, wardrobe changes, and close-up beauty shots, so the team needs makeup artists who can create polished skin, soft glam, and quick touch-ups across multiple looks.\n\nThis opportunity is ideal for artists who understand how makeup reads under camera lighting and can work calmly in a fast-paced creative environment. Selected artists will receive a creative brief, call sheet, reference images, and product direction before the shoot.\n\nRequirements\n\n- Portfolio link with at least 5 makeup looks.\n- Availability for two full shoot days.\n- Lagos-based or able to commute.\n- Professional kit and hygiene setup.\n\nResponsibilities\n\n- Create clean skin-focused glam for models across four campaign looks.\n- Stay on set for touch-ups during styling and photography changes.\n- Work with the creative director to adjust makeup for lighting, wardrobe, and brand direction.\n\nHow to apply\n\nApply with your role, portfolio, availability, location, and a short note about relevant campaign or bridal/editorial experience.",
                'contact_info' => [
                    'short_description' => 'A Lagos fashion label needs makeup artists for a two-day campaign shoot focused on polished skin, soft glam, and on-set touch-ups.',
                    'email' => 'opportunities@beautyprohq.com',
                ],
                'location' => 'Lagos',
                'deadline' => now()->addDays(21)->toDateString(),
            ],
            [
                'title' => 'Beauty Educator Masterclass Partnership',
                'type' => 'partnership',
                'description' => "About the partnership\n\nBeautyPro HQ is looking for experienced beauty educators to co-host practical online masterclasses for early-career and growing beauty professionals. The goal is to create useful sessions that help professionals improve their craft, structure their businesses, and make better client-facing decisions.\n\nTopics may include pricing, client consultation, hygiene, content creation, portfolio building, product selection, business systems, service delivery, or niche technical skills. This is suitable for educators who can teach clearly, share real examples, and give attendees practical next steps they can apply immediately.\n\nWhat the educator will provide\n\n- A clear masterclass topic and session outline.\n- A 60 to 90 minute live online session.\n- Practical examples, exercises, or resources for attendees.\n- A short Q&A segment after the teaching session.\n\nSelection focus\n\nProposals are reviewed for topic relevance, clarity, teaching experience, audience value, and practical usefulness for beauty professionals.\n\nHow to apply\n\nApply with your proposed topic, teaching background, and links that show your work or previous sessions.",
                'contact_info' => [
                    'short_description' => 'BeautyPro HQ is selecting experienced beauty educators to co-host practical online masterclasses for growing beauty professionals.',
                    'email' => 'partners@beautyprohq.com',
                ],
                'location' => 'Remote',
                'deadline' => now()->addMonth()->toDateString(),
            ],
            [
                'title' => 'Nail Technicians for Pop-up Studio',
                'type' => 'vendor_call',
                'description' => "About the pop-up\n\nA weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, nail art, and consultation slots. The event is designed for beauty consumers who want quick, premium services from trusted professionals in a polished pop-up environment.\n\nSelected technicians will operate from assigned service stations and may handle pre-booked appointments, walk-ins, or short consultation slots depending on the final event schedule. This opportunity is a good fit for nail professionals who can work within timed appointments, explain service options clearly, and maintain a clean, welcoming station throughout the day.\n\nRequirements\n\n- Nail portfolio or Instagram page.\n- Preferred service menu with estimated timing.\n- Own tools and kit.\n- Abuja-based availability for the event weekend.\n\nResponsibilities\n\n- Provide express nail services during assigned shifts.\n- Manage appointment slots within agreed service timing.\n- Keep tools, station, and client handling clean and professional.\n\nHow to apply\n\nApply with your portfolio, service menu, availability, and any event or pop-up experience.",
                'contact_info' => [
                    'short_description' => 'A weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, nail art, and consultation slots.',
                    'email' => 'events@beautyprohq.com',
                ],
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
