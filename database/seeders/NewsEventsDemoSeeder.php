<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\News;
use App\Models\User;
use Illuminate\Database\Seeder;

class NewsEventsDemoSeeder extends Seeder
{
    public function run(): void
    {
        $adminId = User::query()
            ->where('role', 'admin')
            ->orderBy('id')
            ->value('id');

        $newsItems = [
            [
                'title' => 'Beauty professionals shaping Nigeria\'s creative economy',
                'slug' => 'beauty-professionals-creative-economy',
                'excerpt' => 'Independent beauty professionals are building sustainable careers, stronger client relationships, and new creative businesses across the country.',
                'content' => '<p>Across Nigeria, beauty professionals are becoming an important part of the creative economy. Makeup artists, hairstylists, nail technicians, lash specialists, skincare professionals, educators, and wellness providers are using digital tools to reach clients, package their work, and build more reliable businesses.</p><p>The shift is not only about visibility. It is about structure. Professionals who document their services, clarify pricing, collect reviews, and manage bookings consistently are creating stronger client trust and better business outcomes.</p><h2>Why this matters</h2><p>Beauty services are deeply personal. Clients are not only buying a finished look; they are buying preparation, hygiene, communication, timing, and confidence. The professionals who understand this are building businesses that can grow beyond referrals alone.</p><h2>What we are seeing</h2><ul><li>More professionals are treating portfolios as business assets, not casual galleries.</li><li>Clients are comparing service experience, response speed, and reviews before booking.</li><li>Educators are helping early-career professionals understand pricing, client care, and systems.</li><li>Beauty businesses are becoming more collaborative across fashion, media, bridal, and lifestyle sectors.</li></ul><p>BeautyPro HQ is designed around this reality: helping trusted professionals get discovered, manage demand, and present their work with the credibility clients expect.</p>',
                'image' => 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1400&q=80',
                'seo_title' => 'Beauty Professionals and Nigeria\'s Creative Economy',
                'seo_description' => 'How beauty professionals are using structure, digital visibility, and client trust to build sustainable creative businesses.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 1,
                'published_at' => now()->subDays(2),
            ],
            [
                'title' => 'Five ways to prepare clients for a flawless appointment',
                'slug' => 'prepare-clients-flawless-appointment',
                'excerpt' => 'Simple communication habits that reduce confusion, improve results, and create a calmer client experience.',
                'content' => '<p>A flawless appointment usually starts before the client arrives. The best beauty professionals use preparation to reduce delays, prevent misunderstandings, and make clients feel cared for from the first message.</p><h2>1. Confirm the service clearly</h2><p>Restate the service, date, time, location, duration, and final price. If there are extras, deposits, travel fees, or add-ons, confirm them before appointment day.</p><h2>2. Send preparation instructions</h2><p>Clients often want to do the right thing but do not know what matters. Share simple instructions such as arriving with clean hair, avoiding certain skincare products, bringing inspiration images, or preparing for a patch test.</p><h2>3. Ask the right consultation questions</h2><p>Ask about allergies, skin sensitivity, hair history, nail condition, desired finish, event timing, and previous service experiences. These details help you recommend the right approach.</p><h2>4. Explain aftercare upfront</h2><p>Aftercare should not feel like an afterthought. Mention what the client should avoid, when to return, and how to maintain results.</p><h2>5. Make communication easy</h2><p>Clients should know how to reach you if they are late, need directions, or have questions. A short reminder message can prevent most appointment friction.</p>',
                'image' => 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1400&q=80',
                'seo_title' => 'How Beauty Professionals Can Prepare Clients for Appointments',
                'seo_description' => 'Five practical ways beauty professionals can improve appointment preparation and client experience.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 2,
                'published_at' => now()->subDays(5),
            ],
            [
                'title' => 'What clients look for before booking a beauty professional',
                'slug' => 'what-clients-look-for-before-booking',
                'excerpt' => 'A practical look at the trust signals that help clients choose one professional over another.',
                'content' => '<p>Clients rarely book on talent alone. They look for signals that suggest the professional is reliable, hygienic, responsive, and able to deliver the specific result they want.</p><h2>Portfolio relevance</h2><p>A strong portfolio shows more than beautiful images. It shows range, consistency, lighting, skin tone experience, hair texture experience, nail detail, finish quality, and the kind of client outcome someone can expect.</p><h2>Clear services and pricing</h2><p>Unclear pricing creates friction. Clients are more confident when they can understand what is included, how long the service takes, where it happens, and whether there are extra costs.</p><h2>Reviews and social proof</h2><p>Reviews help new clients reduce risk. Specific reviews about professionalism, punctuality, hygiene, and final results are especially powerful.</p><h2>Fast, warm communication</h2><p>Response style matters. Clients notice whether a professional answers questions clearly, explains policies respectfully, and makes the booking process easy.</p><h2>Professional presentation</h2><p>Small details like a complete profile, quality images, service descriptions, booking rules, and accurate availability all work together to build trust.</p>',
                'image' => 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1400&q=80',
                'seo_title' => 'What Clients Look For Before Booking Beauty Services',
                'seo_description' => 'The key trust signals clients use when choosing a makeup artist, hairstylist, nail tech, skincare specialist, or other beauty professional.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 3,
                'published_at' => now()->subDays(8),
            ],
            [
                'title' => 'How beauty businesses can improve retention without discounting',
                'slug' => 'beauty-business-retention-without-discounting',
                'excerpt' => 'Retention is built through trust, consistency, follow-up, and a service experience clients want to repeat.',
                'content' => '<p>Discounts can create short-term bookings, but they rarely build long-term loyalty by themselves. Strong retention comes from making clients feel understood, prepared, and confident every time they book.</p><h2>Build a memorable consultation</h2><p>Use each appointment to learn preferences, concerns, allergies, lifestyle, event needs, and maintenance habits. Store useful notes so the next appointment feels personal.</p><h2>Follow up after the service</h2><p>A short message after an appointment can make a strong impression. Ask how the client is enjoying the result and remind them of aftercare steps.</p><h2>Create rebooking moments</h2><p>Recommend a realistic next appointment window. For nails, lashes, haircare, skincare, or bridal prep, timing guidance helps clients plan ahead.</p><h2>Reward consistency</h2><p>Loyalty does not always require heavy discounts. Early access, priority booking, small add-ons, educational resources, or service credits can make repeat clients feel valued.</p><h2>Keep standards consistent</h2><p>Clients return when the experience is dependable. Cleanliness, punctuality, communication, and service quality should not depend on how busy the week is.</p>',
                'image' => 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1400&q=80',
                'seo_title' => 'Beauty Business Retention Without Discounts',
                'seo_description' => 'Practical retention strategies for beauty professionals who want repeat clients without relying on constant discounts.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 4,
                'published_at' => now()->subDays(11),
            ],
        ];

        foreach ($newsItems as $item) {
            News::updateOrCreate(
                ['slug' => $item['slug']],
                $item + [
                    'author_id' => $adminId,
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }

        $eventItems = [
            [
                'title' => 'BPHQ Business Breakfast',
                'slug' => 'bphq-business-breakfast',
                'date' => now()->addWeeks(2)->setTime(9, 0),
                'location' => 'Victoria Island, Lagos',
                'description' => '<p>A practical morning for beauty founders, independent professionals, educators, and studio owners who want stronger business systems. The session will focus on pricing, client retention, appointment structure, and improving the customer journey from first enquiry to repeat booking.</p><h2>What to expect</h2><ul><li>A guided pricing and service-packaging session.</li><li>A client retention discussion with real beauty business examples.</li><li>Small-group networking with other professionals.</li><li>A practical worksheet for reviewing your service menu.</li></ul><h2>Who should attend</h2><p>This event is built for beauty professionals who already serve clients and want to make their business more consistent, profitable, and easier to manage.</p>',
                'image' => 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1400&q=80',
                'registration_url' => 'https://example.com/bphq-breakfast',
                'seo_title' => 'BPHQ Business Breakfast Lagos',
                'seo_description' => 'A BeautyPro HQ business session in Lagos focused on pricing, retention, and client experience.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 5,
                'published_at' => now(),
            ],
            [
                'title' => 'Portfolio Day Abuja',
                'slug' => 'portfolio-day-abuja',
                'date' => now()->addMonth()->setTime(10, 0),
                'location' => 'Wuse 2, Abuja',
                'description' => '<p>Portfolio Day Abuja brings beauty professionals, photographers, stylists, and creative directors together to create clean, portfolio-ready work. The day is designed for professionals who want better images, stronger creative direction, and clearer presentation for future clients.</p><h2>Session format</h2><ul><li>Creative direction briefing before each look.</li><li>Timed beauty, hair, and styling preparation blocks.</li><li>Photography slots with model-ready lighting.</li><li>Feedback on image selection and portfolio sequencing.</li></ul><h2>Best fit</h2><p>Makeup artists, hairstylists, nail technicians, lash artists, and skincare professionals who want stronger visual proof of their work will get the most from this session.</p>',
                'image' => 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1400&q=80',
                'registration_url' => 'https://example.com/portfolio-day',
                'seo_title' => 'Portfolio Day Abuja for Beauty Professionals',
                'seo_description' => 'A creative portfolio-building event for beauty professionals in Abuja.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 6,
                'published_at' => now(),
            ],
            [
                'title' => 'Beauty Educator Masterclass: From Skill to Curriculum',
                'slug' => 'beauty-educator-masterclass-skill-to-curriculum',
                'date' => now()->addWeeks(5)->setTime(18, 0),
                'location' => 'Online',
                'description' => '<p>This online masterclass is for experienced beauty professionals who want to teach more clearly, structure learning outcomes, and turn their expertise into practical training sessions.</p><h2>Topics covered</h2><ul><li>Choosing a focused class promise.</li><li>Breaking technical skills into teachable steps.</li><li>Designing exercises, demonstrations, and learner feedback.</li><li>Pricing and positioning a professional masterclass.</li></ul><h2>Outcome</h2><p>Attendees will leave with a simple masterclass outline, clearer teaching objectives, and a practical plan for testing their first or next paid learning session.</p>',
                'image' => 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80',
                'registration_url' => 'https://example.com/educator-masterclass',
                'seo_title' => 'Beauty Educator Masterclass Online',
                'seo_description' => 'An online masterclass for beauty professionals who want to structure and teach practical training sessions.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 7,
                'published_at' => now(),
            ],
            [
                'title' => 'Clean Beauty Studio Operations Workshop',
                'slug' => 'clean-beauty-studio-operations-workshop',
                'date' => now()->addWeeks(7)->setTime(11, 0),
                'location' => 'Lekki, Lagos',
                'description' => '<p>A hands-on workshop for salon owners, home-studio professionals, and mobile beauty providers who want cleaner operations, better appointment flow, and stronger client confidence.</p><h2>Workshop focus</h2><ul><li>Hygiene standards and tool-handling routines.</li><li>Appointment buffers and service timing.</li><li>Client intake, consultation, and consent workflows.</li><li>Simple systems for stock, supplies, and aftercare communication.</li></ul><h2>Why attend</h2><p>Operational quality is one of the strongest trust signals in beauty. This workshop helps professionals create a calm, repeatable experience that clients can rely on.</p>',
                'image' => 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1400&q=80',
                'registration_url' => 'https://example.com/studio-operations',
                'seo_title' => 'Clean Beauty Studio Operations Workshop',
                'seo_description' => 'A Lagos workshop on hygiene, appointment flow, client intake, and studio systems for beauty professionals.',
                'show_on_homepage' => true,
                'homepage_sort_order' => 8,
                'published_at' => now(),
            ],
        ];

        foreach ($eventItems as $item) {
            Event::updateOrCreate(
                ['slug' => $item['slug']],
                $item + [
                    'created_at' => now(),
                    'updated_at' => now(),
                ],
            );
        }

        $this->command?->info('Seeded 4 news items and 4 events.');
    }
}
