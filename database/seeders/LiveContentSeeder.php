<?php

namespace Database\Seeders;

use App\Models\CommunityPost;
use App\Models\User;
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
                'description' => "<h2>About the opportunity</h2><p>A Lagos fashion label is producing a two-day campaign shoot for a new ready-to-wear beauty editorial. The campaign will feature multiple models, wardrobe changes, and close-up beauty shots, so the team needs makeup artists who can create polished skin, soft glam, and quick touch-ups across multiple looks.</p><p>This opportunity is ideal for artists who understand how makeup reads under camera lighting and can work calmly in a fast-paced creative environment. Selected artists will receive a creative brief, call sheet, reference images, and product direction before the shoot.</p><h3>Requirements</h3><ul><li>Portfolio link with at least 5 makeup looks.</li><li>Availability for two full shoot days.</li><li>Lagos-based or able to commute.</li><li>Professional kit and hygiene setup.</li></ul><h3>Responsibilities</h3><ul><li>Create clean skin-focused glam for models across four campaign looks.</li><li>Stay on set for touch-ups during styling and photography changes.</li><li>Work with the creative director to adjust makeup for lighting, wardrobe, and brand direction.</li></ul><h3>How to apply</h3><p>Apply with your role, portfolio, availability, location, and a short note about relevant campaign or bridal/editorial experience.</p>",
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
                'description' => "<h2>About the partnership</h2><p>BeautyPro HQ is looking for experienced beauty educators to co-host practical online masterclasses for early-career and growing beauty professionals. The goal is to create useful sessions that help professionals improve their craft, structure their businesses, and make better client-facing decisions.</p><p>Topics may include pricing, client consultation, hygiene, content creation, portfolio building, product selection, business systems, service delivery, or niche technical skills. This is suitable for educators who can teach clearly, share real examples, and give attendees practical next steps they can apply immediately.</p><h3>What the educator will provide</h3><ul><li>A clear masterclass topic and session outline.</li><li>A 60 to 90 minute live online session.</li><li>Practical examples, exercises, or resources for attendees.</li><li>A short Q&A segment after the teaching session.</li></ul><h3>Selection focus</h3><p>Proposals are reviewed for topic relevance, clarity, teaching experience, audience value, and practical usefulness for beauty professionals.</p><h3>How to apply</h3><p>Apply with your proposed topic, teaching background, and links that show your work or previous sessions.</p>",
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
                'description' => "<h2>About the pop-up</h2><p>A weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, nail art, and consultation slots. The event is designed for beauty consumers who want quick, premium services from trusted professionals in a polished pop-up environment.</p><p>Selected technicians will operate from assigned service stations and may handle pre-booked appointments, walk-ins, or short consultation slots depending on the final event schedule. This opportunity is a good fit for nail professionals who can work within timed appointments, explain service options clearly, and maintain a clean, welcoming station throughout the day.</p><h3>Requirements</h3><ul><li>Nail portfolio or Instagram page.</li><li>Preferred service menu with estimated timing.</li><li>Own tools and kit.</li><li>Abuja-based availability for the event weekend.</li></ul><h3>Responsibilities</h3><ul><li>Provide express nail services during assigned shifts.</li><li>Manage appointment slots within agreed service timing.</li><li>Keep tools, station, and client handling clean and professional.</li></ul><h3>How to apply</h3><p>Apply with your portfolio, service menu, availability, and any event or pop-up experience.</p>",
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
                'content' => '<p>When this member started, most bookings came from friends and referrals. The breakthrough came from treating the home studio like a complete client experience: clear pricing, a simple consultation flow, confirmed arrival instructions, and a gallery that showed consistent results.</p><h2>What changed</h2><ul><li>She grouped services into simple packages clients could understand quickly.</li><li>She started sending prep notes before each appointment.</li><li>She asked happy clients for reviews and permission to show finished looks.</li></ul><p>The result was fewer back-and-forth messages, better prepared clients, and more repeat bookings from people who trusted the process before they arrived.</p>',
                'type' => 'story',
                'topic' => 'Business growth',
                'group_name' => 'Studio owners',
                'mentions' => ['amara-glam'],
            ],
            [
                'title' => 'Pro spotlight: building trust through great client care',
                'content' => '<p>Great client care starts before the appointment. This spotlight looks at the small systems beauty professionals use to reduce anxiety, set expectations, and create a polished experience.</p><h2>Trust signals that matter</h2><ul><li>Fast, clear replies that confirm availability and service details.</li><li>Photos that show real work, not only inspiration images.</li><li>Transparent pricing, payment methods, and location information.</li><li>Aftercare messages that help clients keep results longer.</li></ul><p>Members in the discussion are sharing the exact messages and checklists that have improved their repeat bookings.</p>',
                'type' => 'spotlight',
                'topic' => 'Client experience',
                'group_name' => 'Service providers',
                'mentions' => ['kemi-crowns'],
            ],
            [
                'title' => 'Community win: more beauty professionals getting discovered',
                'content' => '<p>Community members are getting more intentional about visibility. The most improved profiles have three things in common: accurate location details, compact galleries, and descriptions that explain the client experience in plain language.</p><h2>What members are doing</h2><ul><li>Adding portfolio images that represent their actual work.</li><li>Listing service categories and base prices clearly.</li><li>Using community feedback to improve bios and booking expectations.</li></ul><p>This thread is open for members to share profile updates, ask for feedback, and celebrate small discovery wins.</p>',
                'type' => 'community',
                'topic' => 'Discovery',
                'group_name' => 'General',
                'mentions' => ['beautyprohq'],
            ],
        ];

        $members = User::whereIn('role', ['customer', 'provider'])->where('is_active', true)->limit(4)->get();
        foreach ($posts as $index => $post) {
            $provider = $providers->get($index);
            CommunityPost::updateOrCreate(
                ['title' => $post['title']],
                $post + [
                    'provider_id' => $provider?->id,
                    'image' => $provider?->profile_photo ?: $fallbackImages[$index],
                    'rules' => [
                        'Be respectful and constructive.',
                        'Keep replies relevant to the topic.',
                        'Do not share private client information or spam promotions.',
                    ],
                    'published_at' => now()->subDays($index + 1),
                ],
            )->tap(function (CommunityPost $communityPost) use ($members, $index): void {
                foreach ($members->take(3) as $offset => $member) {
                    $communityPost->reactions()->updateOrCreate(['user_id' => $member->id], ['type' => ['like', 'helpful', 'celebrate'][($index + $offset) % 3]]);
                }
                $commenter = $members->first();
                if ($commenter) {
                    $comment = $communityPost->comments()->updateOrCreate(
                        ['user_id' => $commenter->id, 'parent_id' => null],
                        ['body' => 'This is useful. I am taking notes for my own client flow.', 'mentions' => [], 'status' => 'visible']
                    );
                    $replyUser = $members->skip(1)->first();
                    if ($replyUser) {
                        $communityPost->comments()->updateOrCreate(
                            ['user_id' => $replyUser->id, 'parent_id' => $comment->id],
                            ['body' => 'Same here. The pricing and prep-note ideas are practical.', 'mentions' => [], 'status' => 'visible']
                        );
                    }
                }
                $communityPost->forceFill([
                    'reaction_count' => $communityPost->reactions()->count(),
                    'comment_count' => $communityPost->comments()->visible()->count(),
                ])->save();
            });
        }

        $this->command?->info('Live opportunities and community posts seeded.');
    }
}
