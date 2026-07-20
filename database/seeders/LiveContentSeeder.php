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
                'short_description' => 'A Lagos fashion label needs makeup artists for a two-day campaign shoot focused on polished skin, soft glam, and on-set touch-ups.',
                'description' => "A Lagos fashion label is producing a two-day campaign shoot for a new ready-to-wear beauty editorial. The campaign will feature multiple models, wardrobe changes, and close-up beauty shots, so the team needs makeup artists who can create polished skin, soft glam, and quick touch-ups across multiple looks.\n\nThis opportunity is ideal for artists who understand how makeup reads under camera lighting and can work calmly in a fast-paced creative environment. Selected artists will receive a creative brief, call sheet, reference images, and product direction before the shoot. Applicants should be comfortable collaborating with stylists, photographers, models, and the creative lead while keeping their kit organized and hygienic. The brand is looking for professionals who can arrive prepared, follow direction, adjust looks when needed, and help the production team maintain a smooth shoot flow from call time to wrap.",
                'contact_info' => [
                    'email' => 'opportunities@beautyprohq.com',
                    'responsibilities' => "Create clean skin-focused glam for models across four campaign looks.\nStay on set for touch-ups during styling and photography changes.\nWork with the creative director to adjust makeup for lighting, wardrobe, and brand direction.\nMaintain a clean workstation and follow professional hygiene standards throughout the shoot.",
                    'deliverables' => "Two full shoot days on location.\nMakeup execution for assigned models.\nTouch-up support between looks.\nA short post-shoot note listing products or key techniques used for continuity.",
                    'requirements' => "Portfolio link with at least 5 makeup looks.\nAvailability for two full shoot days.\nLagos-based or able to commute.\nProfessional kit and hygiene setup.\nExperience with bridal, editorial, fashion, or campaign work is preferred.",
                    'compensation' => "Paid campaign booking.\nSelected artists will receive the final fee range before confirmation.\nArtists will also receive image credits where campaign assets are published.",
                    'timeline' => "Applications close in 21 days.\nShortlisted artists will be contacted within 5 working days after the deadline.\nThe final call sheet and creative brief will be shared before the shoot date.",
                    'selection_process' => "Applications are reviewed based on portfolio quality, availability, relevant experience, hygiene readiness, and ability to work professionally on set.",
                    'application_notes' => 'Apply with your role, portfolio, availability, location, and a short note about relevant campaign or bridal/editorial experience.',
                ],
                'location' => 'Lagos',
                'deadline' => now()->addDays(21)->toDateString(),
            ],
            [
                'title' => 'Beauty Educator Masterclass Partnership',
                'type' => 'partnership',
                'short_description' => 'BeautyPro HQ is selecting experienced beauty educators to co-host practical online masterclasses for growing beauty professionals.',
                'description' => "BeautyPro HQ is looking for experienced beauty educators to co-host practical online masterclasses for early-career and growing beauty professionals. The goal is to create useful sessions that help professionals improve their craft, structure their businesses, and make better client-facing decisions.\n\nTopics may include pricing, client consultation, hygiene, content creation, portfolio building, product selection, business systems, service delivery, or niche technical skills. This is suitable for educators who can teach clearly, share real examples, and give attendees practical next steps they can apply immediately. The ideal partner should be able to explain a topic in a simple, structured way, support learners during a short Q&A, and collaborate with the BeautyPro HQ team on session positioning, promotion, and attendee resources. Proposals can be beginner-friendly, intermediate, or focused on a specific professional niche.",
                'contact_info' => [
                    'email' => 'partners@beautyprohq.com',
                    'responsibilities' => "Design and host a practical masterclass for beauty professionals.\nPrepare a clear lesson flow with examples, exercises, and action steps.\nJoin one planning call with the BeautyPro HQ team before the session.\nSupport a short Q&A segment after the teaching session.",
                    'deliverables' => "Masterclass topic and session outline.\nSpeaker bio and promotional photo.\nA 60 to 90 minute live online session.\nOptional worksheet, checklist, or resource guide for attendees.",
                    'requirements' => "Clear topic idea.\nProof of teaching, training, or mentoring experience.\nShort outline of what attendees will learn.\nProfessional bio or profile link.\nComfort presenting to early-career and growing beauty professionals.",
                    'compensation' => "Partnership model depends on session format.\nOptions may include revenue share, fixed speaker honorarium, or promotional collaboration.\nFinal terms will be agreed before announcement.",
                    'timeline' => "Applications close in one month.\nSelected educators will be contacted for a planning call.\nMasterclass dates will be scheduled based on educator availability and content calendar fit.",
                    'selection_process' => "Proposals are reviewed for topic relevance, clarity, teaching experience, audience value, and practical usefulness for beauty professionals.",
                    'application_notes' => 'Apply with your proposed topic, teaching background, and links that show your work or previous sessions.',
                ],
                'location' => 'Remote',
                'deadline' => now()->addMonth()->toDateString(),
            ],
            [
                'title' => 'Nail Technicians for Pop-up Studio',
                'type' => 'vendor_call',
                'short_description' => 'A weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, nail art, and consultation slots.',
                'description' => "A weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, nail art, and consultation slots. The event is designed for beauty consumers who want quick, premium services from trusted professionals in a polished pop-up environment.\n\nSelected technicians will operate from assigned service stations and may handle pre-booked appointments, walk-ins, or short consultation slots depending on the final event schedule. This opportunity is a good fit for nail professionals who can work within timed appointments, explain service options clearly, and maintain a clean, welcoming station throughout the day. The organizers are especially interested in technicians with a strong portfolio, good customer communication, and reliable event availability. Applicants should be prepared to share their preferred service menu, expected timing per service, kit requirements, and any experience working at pop-ups, beauty fairs, bridal events, or brand activations.",
                'contact_info' => [
                    'email' => 'events@beautyprohq.com',
                    'responsibilities' => "Provide express nail services during the weekend pop-up.\nManage appointment slots within agreed service timing.\nExplain available service options clearly to walk-in customers.\nKeep tools, station, and client handling clean and professional.",
                    'deliverables' => "Pop-up service menu with timing.\nOn-site nail service delivery during assigned shifts.\nBefore/after photos where clients consent.\nEnd-of-day update on bookings, common requests, and product/service feedback.",
                    'requirements' => "Nail portfolio or Instagram page.\nPreferred service menu with estimated timing.\nOwn tools/kit.\nAbuja-based availability for the event weekend.\nExperience with gel polish, nail art, manicure, or express services is preferred.",
                    'compensation' => "Vendor participation opportunity with paid service earnings.\nFinal booth/service arrangement and revenue terms will be confirmed with selected technicians.",
                    'timeline' => "Applications close in 14 days.\nShortlisted technicians will receive the event brief and proposed schedule.\nConfirmed technicians will be onboarded before the event weekend.",
                    'selection_process' => "Selection is based on portfolio quality, service fit, event readiness, availability, customer communication, and ability to deliver timed services.",
                    'application_notes' => 'Apply with your portfolio, service menu, availability, and any event/pop-up experience.',
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
