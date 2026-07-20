<?php

namespace Database\Seeders;

use App\Models\Announcement;
use App\Models\Booking;
use App\Models\CommunityPost;
use App\Models\CrmCustomer;
use App\Models\Event;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Opportunity;
use App\Models\Payment;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\SavedProvider;
use App\Models\Subscription;
use App\Models\User;
use App\Models\VerificationRequest;
use Carbon\Carbon;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(SubscriptionPlanSeeder::class);

        $admin = User::create([
            'name' => 'BeautyPro HQ Admin',
            'email' => 'admin@beautyprohq.test',
            'password' => 'password',
            'role' => 'admin',
            'email_verified_at' => now(),
        ]);

        $customerData = [
            ['Ada Okafor', 'ada@beautyprohq.test'],
            ['Tomi Adebayo', 'tomi@beautyprohq.test'],
            ['Zainab Bello', 'zainab@beautyprohq.test'],
            ['Chioma Eze', 'chioma@beautyprohq.test'],
        ];
        $customers = collect($customerData)->map(fn ($item) => User::create([
            'name' => $item[0], 'email' => $item[1], 'password' => 'password', 'role' => 'customer', 'email_verified_at' => now(),
        ]));

        $providerData = [
            ['Amara Nwosu', 'amara@beautyprohq.test', 'Bridal Makeup Artist', 'Lagos', true, 'amara-glam', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80'],
            ['Kemi Johnson', 'kemi@beautyprohq.test', 'Natural Hair Stylist', 'Abuja', true, 'kemi-crowns', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=600&q=80'],
            ['Nneka Obi', 'nneka@beautyprohq.test', 'Nail Technician', 'Lagos', true, 'nails-by-nneka', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80'],
            ['Bisi Lawal', 'bisi@beautyprohq.test', 'Skincare Specialist', 'Ibadan', true, 'bisi-skin-studio', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80'],
            ['Fatima Musa', 'fatima@beautyprohq.test', 'Lash & Brow Artist', 'Kano', true, 'fatima-lash-lab', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80'],
            ['Ifeoma Udeh', 'ifeoma@beautyprohq.test', 'Wig Maker & Colourist', 'Port Harcourt', false, 'ifeoma-wig-artistry', 'https://images.unsplash.com/photo-1534751516642-a1af1ef26a56?auto=format&fit=crop&w=600&q=80'],
            ['Damilola Cole', 'dami@beautyprohq.test', 'Beauty Educator', 'Lagos', false, 'dami-beauty-academy', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=600&q=80'],
            ['Rita Essien', 'rita@beautyprohq.test', 'Massage Therapist', 'Uyo', false, 'rita-wellness', 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80'],
        ];

        $providers = collect();
        foreach ($providerData as $index => [$name, $email, $profession, $location, $verified, $slug, $photo]) {
            $user = User::create(['name' => $name, 'email' => $email, 'password' => 'password', 'role' => 'provider', 'email_verified_at' => now()]);
            $categorySlug = match (true) {
                str_contains(strtolower($profession), 'makeup') => 'makeup-artist',
                str_contains(strtolower($profession), 'hair') || str_contains(strtolower($profession), 'wig') => 'hairstylist',
                str_contains(strtolower($profession), 'nail') => 'nail-technician',
                str_contains(strtolower($profession), 'lash') => 'lash-technician',
                str_contains(strtolower($profession), 'skin') => 'esthetician-skin-specialist',
                str_contains(strtolower($profession), 'educator') => 'beauty-educator',
                default => 'esthetician-skin-specialist',
            };
            $categoryId = ProviderCategory::where('slug', $categorySlug)->value('id');
            $profile = ProviderProfile::create([
                'user_id' => $user->id, 'provider_category_id' => $categoryId, 'slug' => $slug, 'profession' => $profession,
                'bio' => "{$name} delivers thoughtful, modern beauty services with a focus on comfort, craft and results.",
                'location' => $location, 'country' => 'Nigeria', 'city' => $location, 'verified' => $verified, 'is_pro_of_week' => $index === 0,
                'rating' => 0, 'review_count' => 0,
                'profile_photo' => $photo,
                'cover_image' => 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1400&q=80',
                'contact_email' => $email,
                'contact_phone' => '+2348012345678',
                'website' => 'https://example.com',
                'default_currency' => 'NGN',
                'base_price' => 15000 + ($index * 2500),
                'terms_accepted_at' => now(),
                'onboarding_completed_at' => now(),
                'social_links' => ['instagram' => 'https://instagram.com/beautyprohq', 'website' => 'https://example.com'],
                'portfolio_links' => ['https://instagram.com/beautyprohq'],
            ]);

            $services = match ($index % 4) {
                0 => [['Soft Glam Makeup', 'Makeup', 35000, 90], ['Bridal Makeup', 'Makeup', 120000, 180], ['Makeup Consultation', 'Consultation', 15000, 45]],
                1 => [['Silk Press', 'Hair', 28000, 120], ['Protective Styling', 'Hair', 45000, 180], ['Hair Consultation', 'Consultation', 10000, 30]],
                2 => [['Gel Manicure', 'Nails', 18000, 75], ['Luxury Pedicure', 'Nails', 22000, 90], ['Nail Art Set', 'Nails', 30000, 120]],
                default => [['Skin Consultation', 'Skincare', 15000, 45], ['Signature Facial', 'Skincare', 40000, 90], ['Glow Treatment', 'Skincare', 55000, 120]],
            };
            foreach ($services as [$serviceName, $category, $price, $duration]) {
                $profile->services()->create(['name' => $serviceName, 'category' => $category, 'price' => $price, 'duration_minutes' => $duration, 'service_type' => str_contains($serviceName, 'Consultation') ? 'virtual' : 'in_person', 'description' => "Professional {$serviceName} tailored to your needs."]);
            }
            foreach (range(1, 6) as $day) {
                $profile->availability()->create(['day_of_week' => $day, 'start_time' => '09:00', 'end_time' => $day === 6 ? '15:00' : '18:00']);
            }
            $profile->portfolioItems()->createMany([
                ['title' => 'Signature finish', 'media_url' => 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80', 'sort_order' => 1],
                ['title' => 'Client transformation', 'media_url' => 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80', 'sort_order' => 2],
            ]);
            if ($verified) {
                $digitalProduct = match ($index % 5) {
                    0 => ['Bridal Prep Checklist', 'A practical checklist for brides preparing for makeup trials and wedding-day glam.', 9500, 'https://example.com/bridal-prep-checklist'],
                    1 => ['Healthy Hair Routine Guide', 'A simple routine planner for clients maintaining natural hair between appointments.', 8500, 'https://example.com/healthy-hair-routine'],
                    2 => ['Nail Aftercare Mini Guide', 'Care instructions to help clients protect gel sets, extensions, and nail art.', 6500, 'https://example.com/nail-aftercare-guide'],
                    3 => ['Glow Skin Prep Guide', 'A pre-facial and post-treatment guide for better skincare results.', 9000, 'https://example.com/glow-skin-prep'],
                    default => ['Beauty Client Care Template', 'A reusable client-care message template for beauty professionals.', 7500, 'https://example.com/client-care-template'],
                };
                $profile->digitalProducts()->create(['name' => $digitalProduct[0], 'description' => $digitalProduct[1], 'price' => $digitalProduct[2], 'url' => $digitalProduct[3], 'image' => $photo]);
            }
            $profile->rewards()->create(['name' => '₦5,000 service credit', 'description' => 'Redeem on your next appointment.', 'points_required' => 100]);
            Subscription::create(['user_id' => $user->id, 'plan' => $verified ? 'pro' : 'free', 'status' => 'active', 'starts_at' => now()]);
            VerificationRequest::create(['provider_id' => $profile->id, 'portfolio_links' => $profile->portfolio_links, 'certification_files' => [], 'status' => $verified ? 'approved' : ($index === 5 ? 'pending' : 'rejected'), 'reviewed_by' => $verified ? $admin->id : null, 'reviewed_at' => $verified ? now()->subDays(20) : null]);
            $providers->push($profile);
        }

        $nextWorkingDay = function (int $offset): Carbon {
            $date = Carbon::today()->addDays($offset);

            return $date->dayOfWeek === 0 ? $date->addDay() : $date;
        };
        foreach (range(0, 11) as $index) {
            $provider = $providers[$index % $providers->count()];
            $customer = $customers[$index % $customers->count()];
            $service = $provider->services[$index % $provider->services->count()];
            $status = $index < $providers->count() ? 'completed' : match ($index) {
                8, 11 => 'confirmed', 9 => 'pending', default => 'cancelled'
            };
            $date = $status === 'completed' ? Carbon::today()->subDays(7 + $index) : $nextWorkingDay(2 + $index);
            $booking = Booking::create([
                'provider_id' => $provider->id, 'customer_id' => $customer->id, 'service_id' => $service->id,
                'date' => $date, 'time' => '11:00', 'end_time' => Carbon::parse('11:00')->addMinutes($service->duration_minutes)->format('H:i:s'),
                'status' => $status, 'notes' => $index % 3 === 0 ? 'First visit — please share preparation tips.' : null,
                'cancelled_at' => $status === 'cancelled' ? now() : null,
            ]);
            Payment::create(['booking_id' => $booking->id, 'amount' => $service->price, 'provider_id' => $provider->id, 'gateway' => 'paystack', 'reference' => 'BPHQ-DEMO-'.str_pad((string) $booking->id, 4, '0', STR_PAD_LEFT), 'status' => $status === 'completed' ? 'paid' : 'pending', 'paid_at' => $status === 'completed' ? $date : null]);
            if ($status === 'completed') {
                $review = Review::create(['booking_id' => $booking->id, 'provider_id' => $provider->id, 'customer_id' => $customer->id, 'rating' => 5 - ($index % 2), 'comment' => $index % 2 ? 'Warm, professional service and a beautiful result.' : 'Excellent experience. I will definitely book again.']);
                $crm = CrmCustomer::firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $customer->id], ['notes' => 'Prefers morning appointments.', 'tags' => ['returning'], 'last_service_at' => $date]);
                $loyalty = Loyalty::firstOrCreate(['provider_id' => $provider->id, 'customer_id' => $customer->id], ['points' => 40, 'lifetime_points' => 40]);
                LoyaltyTransaction::create(['loyalty_id' => $loyalty->id, 'booking_id' => $booking->id, 'points' => 40, 'reason' => 'Demo completed booking']);
            }
        }
        foreach ($providers as $provider) {
            $provider->update([
                'rating' => round((float) $provider->reviews()->where('is_approved', true)->avg('rating'), 2),
                'review_count' => $provider->reviews()->where('is_approved', true)->count(),
            ]);
        }
        SavedProvider::create(['customer_id' => $customers[0]->id, 'provider_id' => $providers[0]->id]);
        SavedProvider::create(['customer_id' => $customers[0]->id, 'provider_id' => $providers[1]->id]);

        News::insert([
            ['title' => 'Beauty professionals shaping Nigeria’s creative economy', 'slug' => 'beauty-professionals-creative-economy', 'excerpt' => 'Independent beauty professionals are building sustainable careers and stronger communities.', 'content' => 'Across Nigeria, beauty professionals are combining craft, business discipline and community to create meaningful economic opportunity.', 'image' => 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80', 'published_at' => now()->subDays(2), 'author_id' => $admin->id, 'created_at' => now(), 'updated_at' => now()],
            ['title' => 'Five ways to prepare clients for a flawless appointment', 'slug' => 'prepare-clients-flawless-appointment', 'excerpt' => 'Simple communication habits that improve every appointment.', 'content' => 'Clear reminders, thoughtful consultations and transparent after-care guidance make the client experience smoother.', 'image' => 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1200&q=80', 'published_at' => now()->subDays(5), 'author_id' => $admin->id, 'created_at' => now(), 'updated_at' => now()],
        ]);
        Event::insert([
            ['title' => 'BPHQ Business Breakfast', 'slug' => 'bphq-business-breakfast', 'date' => now()->addWeeks(2), 'location' => 'Victoria Island, Lagos', 'description' => 'A practical morning of pricing, client retention and peer networking.', 'image' => 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80', 'registration_url' => 'https://example.com/bphq-breakfast', 'published_at' => now(), 'created_at' => now(), 'updated_at' => now()],
            ['title' => 'Portfolio Day Abuja', 'slug' => 'portfolio-day-abuja', 'date' => now()->addMonth(), 'location' => 'Wuse 2, Abuja', 'description' => 'Create portfolio-ready work with photographers and creative directors.', 'image' => 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1200&q=80', 'registration_url' => 'https://example.com/portfolio-day', 'published_at' => now(), 'created_at' => now(), 'updated_at' => now()],
        ]);
        Opportunity::insert([
            ['title' => 'Makeup Artists for Fashion Campaign', 'type' => 'job', 'description' => 'A Lagos fashion label needs two experienced makeup artists for a two-day campaign shoot.', 'contact_info' => json_encode(['email' => 'opportunities@beautyprohq.test']), 'location' => 'Lagos', 'deadline' => now()->addDays(18)->toDateString(), 'published_at' => now(), 'created_at' => now(), 'updated_at' => now()],
            ['title' => 'Beauty Educator Partnership', 'type' => 'partnership', 'description' => 'Partner with BPHQ on a practical online masterclass for early-career professionals.', 'contact_info' => json_encode(['email' => 'partners@beautyprohq.test']), 'location' => 'Remote', 'deadline' => now()->addMonth()->toDateString(), 'published_at' => now(), 'created_at' => now(), 'updated_at' => now()],
        ]);
        CommunityPost::create(['title' => 'From home studio to booked-out salon', 'content' => 'Amara shares how consistent systems, clear pricing and genuine client care helped her grow.', 'type' => 'story', 'provider_id' => $providers[0]->id, 'image' => $providers[0]->profile_photo, 'published_at' => now()->subDay()]);
        CommunityPost::create(['title' => 'Pro spotlight: Kemi Crowns', 'content' => 'Meet the natural hair specialist building confidence one healthy-hair routine at a time.', 'type' => 'spotlight', 'provider_id' => $providers[1]->id, 'image' => $providers[1]->profile_photo, 'published_at' => now()->subDays(3)]);
        Announcement::create(['title' => 'Welcome to BeautyPro HQ', 'message' => 'Complete your profile and availability to start receiving bookings.', 'audience' => 'provider', 'published_at' => now()]);
        NewsletterSubscriber::create(['email' => 'demo@beautyprohq.test', 'subscribed_at' => now()]);
    }
}
