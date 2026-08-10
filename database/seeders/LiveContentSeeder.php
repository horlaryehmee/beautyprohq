<?php

namespace Database\Seeders;

use App\Models\CommunityPost;
use App\Models\User;
use App\Models\Opportunity;
use App\Models\ProviderProfile;
use App\Support\CommunityDemoContent;
use Illuminate\Database\Seeder;

class LiveContentSeeder extends Seeder
{
    public function run(): void
    {
        $opportunities = [
            [
                'title' => 'Makeup Artists for Fashion Campaign',
                'type' => 'job',
                'description' => "<h2>About the opportunity</h2><p>A Lagos fashion label is producing a two-day campaign shoot for a new ready-to-wear beauty editorial. The campaign will feature multiple models, wardrobe changes, indoor studio portraits, outdoor lifestyle scenes, and detailed close-up beauty shots, so the team needs makeup artists who can create polished skin, soft glam, defined features, and quick touch-ups across multiple looks without slowing down production.</p><p>This opportunity is ideal for artists who understand how makeup reads under camera lighting and can work calmly in a fast-paced creative environment. Selected artists will receive a creative brief, call sheet, reference images, product direction, model list, and timing notes before the shoot. The creative team wants artists who can follow a brief while still bringing professional judgment around skin prep, color matching, hygiene, product durability, and on-set continuity.</p><h3>Requirements</h3><ul><li>Portfolio link with at least 5 makeup looks, preferably including editorial, bridal, campaign, or studio work.</li><li>Availability for two full shoot days, including early call time and possible touch-ups between scenes.</li><li>Lagos-based or able to commute reliably to the production location.</li><li>Professional kit, disposable applicators, brush hygiene setup, and products suitable for different skin tones.</li></ul><h3>Responsibilities</h3><ul><li>Create clean skin-focused glam for models across four campaign looks.</li><li>Stay on set for touch-ups during styling, lighting, and photography changes.</li><li>Work with the creative director to adjust makeup for lighting, wardrobe, and brand direction.</li><li>Keep each model camera-ready while protecting the pace and professionalism of the shoot.</li></ul><h3>How to apply</h3><p>Apply with your role, portfolio, availability, location, day rate, and a short note about relevant campaign, bridal, studio, or editorial experience. Shortlisted artists may be asked for a brief call before final confirmation.</p>",
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
                'description' => "<h2>About the partnership</h2><p>BeautyPro HQ is looking for experienced beauty educators to co-host practical online masterclasses for early-career and growing beauty professionals. The goal is to create useful sessions that help professionals improve their craft, structure their businesses, communicate better with clients, and make stronger day-to-day decisions around pricing, service delivery, presentation, and customer retention.</p><p>Topics may include pricing, client consultation, hygiene, content creation, portfolio building, product selection, business systems, service delivery, social media planning, bridal client management, beginner-friendly technical skills, or niche services such as lashes, nails, wig customization, facials, brow design, or makeup for photography. This is suitable for educators who can teach clearly, share real examples, explain common mistakes, and give attendees practical next steps they can apply immediately after the session.</p><h3>What the educator will provide</h3><ul><li>A clear masterclass topic, learning outcome, and session outline.</li><li>A 60 to 90 minute live online session with structured teaching and examples.</li><li>Practical exercises, templates, checklists, demonstrations, or downloadable resources for attendees.</li><li>A short Q&A segment after the teaching session, with answers that are useful for both beginners and growing professionals.</li></ul><h3>Selection focus</h3><p>Proposals are reviewed for topic relevance, clarity, teaching experience, audience value, practical usefulness, and the educator's ability to support BeautyPro HQ's community of service providers. We are especially interested in sessions that are specific, actionable, and grounded in real beauty business experience rather than broad motivation.</p><h3>How to apply</h3><p>Apply with your proposed topic, teaching background, outline, preferred session length, links that show your work or previous sessions, and any resource you would like attendees to receive. Selected educators may be invited to co-create the final session plan with the BeautyPro HQ team.</p>",
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
                'description' => "<h2>About the pop-up</h2><p>A weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, nail art, extensions, simple repairs, and consultation slots. The event is designed for beauty consumers who want quick, premium services from trusted professionals in a polished pop-up environment where they can discover new providers, ask questions, and book future appointments.</p><p>Selected technicians will operate from assigned service stations and may handle pre-booked appointments, walk-ins, or short consultation slots depending on the final event schedule. This opportunity is a good fit for nail professionals who can work within timed appointments, explain service options clearly, maintain a clean station, and create a welcoming experience for first-time clients. The organizers want providers who understand sanitation, client comfort, proper prep, product knowledge, and professional presentation in a busy public setting.</p><h3>Requirements</h3><ul><li>Nail portfolio, Instagram page, or clear sample photos showing recent work.</li><li>Preferred service menu with estimated timing, prices, and any limitations for pop-up delivery.</li><li>Own tools, lamp, core products, disposables, sanitizing materials, and tidy table setup.</li><li>Abuja-based availability for the event weekend, including setup time before doors open.</li></ul><h3>Responsibilities</h3><ul><li>Provide express nail services during assigned shifts while keeping appointments on time.</li><li>Manage appointment slots within agreed service timing and communicate clearly with clients.</li><li>Keep tools, station, products, and client handling clean, organized, and professional.</li><li>Share after-care guidance and encourage interested clients to follow or book future services.</li></ul><h3>How to apply</h3><p>Apply with your portfolio, service menu, availability, preferred shift times, location, and any event, salon, bridal, or pop-up experience. Shortlisted technicians may be contacted for final service-menu alignment before vendor confirmation.</p>",
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

        $members = User::whereIn('role', ['admin', 'customer', 'provider'])->where('is_active', true)->limit(8)->get();
        foreach (CommunityDemoContent::posts() as $index => $post) {
            $provider = $providers->get($index);
            $communityPost = CommunityPost::updateOrCreate(
                ['title' => $post['title']],
                $post + [
                    'provider_id' => $provider?->id,
                    'mentions' => array_values(array_unique(array_merge($post['mentions'], [$provider?->slug ?: 'beautyprohq']))),
                    'image' => $provider?->profile_photo ?: $fallbackImages[$index % count($fallbackImages)],
                    'rules' => CommunityDemoContent::rules(),
                    'published_at' => now()->subDays($index + 1),
                ],
            );

            CommunityDemoContent::seedInteractions($communityPost, $members, $index);
        }

        $this->command?->info('Live opportunities and community posts seeded.');
    }
}
