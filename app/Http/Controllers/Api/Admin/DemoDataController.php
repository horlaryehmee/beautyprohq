<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Announcement;
use App\Models\Availability;
use App\Models\Booking;
use App\Models\CommunityPost;
use App\Models\CrmCustomer;
use App\Models\DigitalProduct;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Models\News;
use App\Models\NewsletterSubscriber;
use App\Models\Opportunity;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PortfolioItem;
use App\Models\ProviderCategory;
use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\Reward;
use App\Models\SavedProvider;
use App\Models\Service;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\SubscriptionPlan;
use App\Models\User;
use App\Models\VerificationRequest;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;

class DemoDataController extends Controller
{
    public function status(): JsonResponse
    {
        return $this->success($this->counts());
    }

    public function populate(): JsonResponse
    {
        DB::transaction(function (): void {
            $this->markKnownSampleRecordsAsDemo();
            $this->clearDemoRecords();

            $admin = $this->demoUser('BeautyPro HQ Demo Admin', 'demo.admin@beautyprohq.test', 'admin');

            $customers = collect([
                ['Ada Okafor', 'ada@beautyprohq.test', '+2348010000001'],
                ['Tomi Adebayo', 'tomi@beautyprohq.test', '+2348010000002'],
                ['Zainab Bello', 'zainab@beautyprohq.test', '+2348010000003'],
                ['Chioma Eze', 'chioma@beautyprohq.test', '+2348010000004'],
            ])->map(fn ($item) => $this->demoUser($item[0], $item[1], 'customer', $item[2]));

            $providers = $this->seedProviders($admin);
            $this->seedBookingsAndUsage($providers, $customers);
            $this->seedContent($admin, $providers, $customers);
        });
        $this->flushPublicHomeCache();

        return $this->success($this->counts(), 'Demo data populated.');
    }

    public function clear(): JsonResponse
    {
        DB::transaction(function (): void {
            $this->clearDemoRecords();
        });
        $this->flushPublicHomeCache();

        return $this->success($this->counts(), 'Demo data cleared.');
    }

    private function flushPublicHomeCache(): void
    {
        Cache::forget('public.home.payload.v5');
    }

    private function markKnownSampleRecordsAsDemo(): void
    {
        User::whereIn('email', [
            'ada@beautyprohq.test',
            'tomi@beautyprohq.test',
            'zainab@beautyprohq.test',
            'chioma@beautyprohq.test',
            'amara@beautyprohq.test',
            'kemi@beautyprohq.test',
            'nneka@beautyprohq.test',
            'bisi@beautyprohq.test',
            'fatima@beautyprohq.test',
            'yara@beautyprohq.test',
            'ifeoma@beautyprohq.test',
            'dami@beautyprohq.test',
            'rita@beautyprohq.test',
        ])->update(['is_demo' => true]);

        News::whereIn('slug', [
            'beauty-professionals-creative-economy',
            'prepare-clients-flawless-appointment',
            'what-clients-look-for-before-booking',
            'beauty-business-retention-without-discounting',
        ])->update(['is_demo' => true]);

        Event::whereIn('slug', [
            'bphq-business-breakfast',
            'portfolio-day-abuja',
            'beauty-educator-masterclass-skill-to-curriculum',
            'clean-beauty-studio-operations-workshop',
        ])->update(['is_demo' => true]);

        Opportunity::whereIn('title', [
            'Makeup Artists for Fashion Campaign',
            'Beauty Educator Partnership',
            'Beauty Educator Masterclass Partnership',
            'Nail Technicians for Pop-up Studio',
        ])->update(['is_demo' => true]);

        CommunityPost::whereIn('title', [
            'From home studio to booked-out salon',
            'Pro spotlight: Kemi Crowns',
            'From home studio to growing beauty brand',
            'Pro spotlight: building trust through great client care',
            'Community win: more beauty professionals getting discovered',
        ])->update(['is_demo' => true]);
    }

    private function clearDemoRecords(): void
    {
        $demoProviderIds = ProviderProfile::where('is_demo', true)
            ->orWhereHas('user', fn ($query) => $query->where('is_demo', true))
            ->pluck('id');
        $demoUserIds = User::where('is_demo', true)->pluck('id');
        $demoBookingIds = Booking::where('is_demo', true)
            ->orWhereIn('provider_id', $demoProviderIds)
            ->orWhereIn('customer_id', $demoUserIds)
            ->pluck('id');
        $demoEventIds = Event::where('is_demo', true)->pluck('id');
        $demoLoyaltyIds = Loyalty::whereIn('provider_id', $demoProviderIds)->orWhereIn('customer_id', $demoUserIds)->pluck('id');

        EventRegistration::whereIn('event_id', $demoEventIds)->orWhereIn('user_id', $demoUserIds)->delete();
        SubscriptionPayment::whereIn('user_id', $demoUserIds)->delete();
        Subscription::whereIn('user_id', $demoUserIds)->delete();
        Payment::whereIn('booking_id', $demoBookingIds)->orWhereIn('provider_id', $demoProviderIds)->delete();
        LoyaltyTransaction::whereIn('loyalty_id', $demoLoyaltyIds)->orWhereIn('booking_id', $demoBookingIds)->delete();
        Loyalty::whereIn('id', $demoLoyaltyIds)->delete();
        CrmCustomer::whereIn('provider_id', $demoProviderIds)->orWhereIn('customer_id', $demoUserIds)->delete();
        SavedProvider::whereIn('provider_id', $demoProviderIds)->orWhereIn('customer_id', $demoUserIds)->delete();
        PaymentAccount::whereIn('provider_id', $demoProviderIds)->delete();
        DigitalProduct::whereIn('provider_id', $demoProviderIds)->delete();
        Reward::whereIn('provider_id', $demoProviderIds)->delete();
        VerificationRequest::whereIn('provider_id', $demoProviderIds)->delete();

        Review::where('is_demo', true)->orWhereIn('provider_id', $demoProviderIds)->orWhereIn('customer_id', $demoUserIds)->delete();
        Booking::where('is_demo', true)->orWhereIn('provider_id', $demoProviderIds)->orWhereIn('customer_id', $demoUserIds)->delete();
        PortfolioItem::where('is_demo', true)->orWhereIn('provider_id', $demoProviderIds)->delete();
        Availability::where('is_demo', true)->orWhereIn('provider_id', $demoProviderIds)->delete();
        Service::where('is_demo', true)->orWhereIn('provider_id', $demoProviderIds)->delete();
        CommunityPost::where('is_demo', true)->orWhereIn('provider_id', $demoProviderIds)->delete();
        ProviderProfile::where('is_demo', true)->orWhereIn('id', $demoProviderIds)->delete();
        User::where('is_demo', true)->delete();
        ProviderCategory::where('is_demo', true)->whereDoesntHave('providers')->delete();

        News::where('is_demo', true)->delete();
        Event::where('is_demo', true)->delete();
        Opportunity::where('is_demo', true)->delete();
        NewsletterSubscriber::where('email', 'demo@beautyprohq.test')->orWhere('email', 'demo.newsletter@beautyprohq.test')->delete();
        Announcement::where('title', 'BPHQ Demo Platform Notice')->delete();
    }

    private function demoUser(string $name, string $email, string $role, ?string $phone = null): User
    {
        return User::updateOrCreate(
            ['email' => $email],
            [
                'is_demo' => true,
                'name' => $name,
                'phone' => $phone,
                'password' => Hash::make('password'),
                'role' => $role,
                'is_active' => true,
                'email_verified_at' => now(),
                'last_login_at' => now()->subDays(rand(1, 12)),
            ],
        );
    }

    private function seedProviders(User $admin): \Illuminate\Support\Collection
    {
        $providerData = [
            ['Amara Nwosu', 'amara@beautyprohq.test', 'Bridal Makeup Artist', 'Lagos', true, 'amara-glam', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80'],
            ['Kemi Johnson', 'kemi@beautyprohq.test', 'Natural Hair Stylist', 'Abuja', true, 'kemi-crowns', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=900&q=80'],
            ['Nneka Obi', 'nneka@beautyprohq.test', 'Nail Technician', 'Lagos', true, 'nails-by-nneka', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80'],
            ['Bisi Lawal', 'bisi@beautyprohq.test', 'Skincare Specialist', 'Ibadan', true, 'bisi-skin-studio', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80'],
            ['Fatima Musa', 'fatima@beautyprohq.test', 'Lash & Brow Artist', 'Kano', true, 'fatima-lash-lab', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80'],
            ['Yara Danjuma', 'yara@beautyprohq.test', 'Barber & Grooming Specialist', 'Lagos', true, 'yara-grooming-studio', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80'],
            ['Ifeoma Udeh', 'ifeoma@beautyprohq.test', 'Wig Maker & Colourist', 'Port Harcourt', false, 'ifeoma-wig-artistry', 'https://images.unsplash.com/photo-1534751516642-a1af1ef26a56?auto=format&fit=crop&w=900&q=80'],
            ['Damilola Cole', 'dami@beautyprohq.test', 'Beauty Educator', 'Lagos', false, 'dami-beauty-academy', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=80'],
            ['Rita Essien', 'rita@beautyprohq.test', 'Massage Therapist', 'Uyo', false, 'rita-wellness', 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=80'],
        ];

        return collect($providerData)->map(function ($item, $index) use ($admin) {
            [$name, $email, $profession, $location, $verified, $slug, $photo] = $item;
            $user = $this->demoUser($name, $email, 'provider', '+234802000000'.$index);
            $category = $this->categoryForProfession($profession);

            $profile = ProviderProfile::updateOrCreate(
                ['user_id' => $user->id],
                [
                    'is_demo' => true,
                    'provider_category_id' => $category?->id,
                    'slug' => $slug,
                    'profession' => $profession,
                    'bio' => "{$name} delivers thoughtful, modern beauty services with a focus on comfort, craft and results.",
                    'location' => $location,
                    'country' => 'Nigeria',
                    'city' => $location,
                    'verified' => $verified,
                    'is_listed' => true,
                    'is_pro_of_week' => $index === 0,
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
                    'booking_form_fields' => [
                        ['label' => 'Do you have allergies or sensitivities?', 'type' => 'textarea', 'required' => false],
                        ['label' => 'What result or look are you hoping for?', 'type' => 'textarea', 'required' => false],
                    ],
                ],
            );

            foreach ($this->servicesForIndex($index) as [$serviceName, $serviceCategory, $price, $duration]) {
                Service::updateOrCreate(
                    ['provider_id' => $profile->id, 'name' => $serviceName],
                    [
                        'is_demo' => true,
                        'category' => $serviceCategory,
                        'price' => $price,
                        'duration_minutes' => $duration,
                        'service_type' => str_contains($serviceName, 'Consultation') ? 'virtual' : 'in_person',
                        'description' => "Professional {$serviceName} tailored to your needs.",
                        'is_active' => true,
                    ],
                );
            }

            foreach (range(1, 6) as $day) {
                Availability::updateOrCreate(
                    ['provider_id' => $profile->id, 'day_of_week' => $day, 'start_time' => '09:00:00', 'end_time' => $day === 6 ? '15:00:00' : '18:00:00'],
                    ['is_demo' => true, 'is_active' => true],
                );
            }

            foreach ([
                ['Signature finish', 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80', 1],
                ['Client transformation', 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80', 2],
            ] as [$title, $image, $order]) {
                PortfolioItem::updateOrCreate(
                    ['provider_id' => $profile->id, 'title' => $title],
                    ['is_demo' => true, 'description' => 'Demo portfolio image for profile and directory testing.', 'media_url' => $image, 'media_type' => 'image', 'sort_order' => $order],
                );
            }

            if ($verified) {
                $product = $this->digitalProductForIndex($index, $photo);
                DigitalProduct::updateOrCreate(
                    ['provider_id' => $profile->id, 'name' => $product[0]],
                    ['description' => $product[1], 'price' => $product[2], 'url' => $product[3], 'image' => $product[4], 'currency' => 'NGN', 'is_active' => true],
                );
            }

            Reward::updateOrCreate(
                ['provider_id' => $profile->id, 'name' => 'NGN 5,000 service credit'],
                ['description' => 'Redeem on your next appointment.', 'points_required' => 100, 'is_active' => true],
            );

            PaymentAccount::updateOrCreate(
                ['provider_id' => $profile->id, 'gateway' => 'paystack'],
                ['account_reference' => 'DEMO-PAYSTACK-'.$profile->id, 'account_name' => $name, 'account_identifier' => 'demo-'.$profile->id.'@paystack.test', 'is_connected' => $verified, 'enabled' => $verified],
            );

            $subscription = Subscription::updateOrCreate(
                ['user_id' => $user->id],
                ['plan' => $verified ? 'pro' : 'free', 'status' => 'active', 'starts_at' => now()->subMonth(), 'renews_at' => now()->addMonth(), 'amount' => $verified ? 15000 : 0, 'currency' => 'NGN'],
            );

            if ($verified) {
                SubscriptionPayment::updateOrCreate(
                    ['reference' => 'BPHQ-DEMO-SUB-'.$user->id],
                    ['user_id' => $user->id, 'subscription_id' => $subscription->id, 'subscription_plan_id' => SubscriptionPlan::where('key', 'paid')->orWhere('key', 'pro')->value('id'), 'gateway' => 'paystack', 'amount' => 15000, 'currency' => 'NGN', 'status' => 'paid', 'paid_at' => now()->subDays(8)],
                );
            }

            VerificationRequest::updateOrCreate(
                ['provider_id' => $profile->id],
                [
                    'portfolio_links' => $profile->portfolio_links,
                    'certification_files' => [],
                    'social_links' => $profile->social_links,
                    'professional_info' => "{$profession}\n{$location}, Nigeria\nDemo verification record created from admin settings.",
                    'status' => $verified ? 'approved' : ($index === 5 ? 'pending' : 'rejected'),
                    'reviewed_by' => $verified ? $admin->id : null,
                    'reviewed_at' => $verified ? now()->subDays(20) : null,
                ],
            );

            return $profile->fresh(['services']);
        });
    }

    private function seedBookingsAndUsage(\Illuminate\Support\Collection $providers, \Illuminate\Support\Collection $customers): void
    {
        $nextWorkingDay = function (int $offset): Carbon {
            $date = Carbon::today()->addDays($offset);

            return $date->dayOfWeek === 0 ? $date->addDay() : $date;
        };

        foreach (range(0, 11) as $index) {
            $provider = $providers[$index % $providers->count()];
            $customer = $customers[$index % $customers->count()];
            $service = $provider->services[$index % $provider->services->count()];
            $status = $index < $providers->count() ? 'completed' : match ($index) {
                8, 11 => 'confirmed',
                9 => 'pending',
                default => 'cancelled',
            };
            $date = $status === 'completed' ? Carbon::today()->subDays(7 + $index) : $nextWorkingDay(2 + $index);

            $booking = Booking::updateOrCreate(
                ['provider_id' => $provider->id, 'customer_id' => $customer->id, 'service_id' => $service->id, 'date' => $date->toDateString(), 'time' => '11:00:00'],
                [
                    'is_demo' => true,
                    'end_time' => Carbon::parse('11:00')->addMinutes($service->duration_minutes)->format('H:i:s'),
                    'status' => $status,
                    'notes' => $index % 3 === 0 ? 'First visit - please share preparation tips.' : null,
                    'cancelled_at' => $status === 'cancelled' ? now() : null,
                ],
            );

            Payment::updateOrCreate(
                ['booking_id' => $booking->id],
                ['amount' => $service->price, 'provider_id' => $provider->id, 'gateway' => 'paystack', 'reference' => 'BPHQ-DEMO-BOOKING-'.$booking->id, 'status' => $status === 'completed' ? 'paid' : 'pending', 'paid_at' => $status === 'completed' ? $date : null],
            );

            if ($status === 'completed') {
                Review::updateOrCreate(
                    ['booking_id' => $booking->id],
                    ['is_demo' => true, 'provider_id' => $provider->id, 'customer_id' => $customer->id, 'rating' => 5 - ($index % 2), 'comment' => $index % 2 ? 'Warm, professional service and a beautiful result.' : 'Excellent experience. I will definitely book again.', 'is_approved' => true],
                );

                $crm = CrmCustomer::updateOrCreate(
                    ['provider_id' => $provider->id, 'customer_id' => $customer->id],
                    ['notes' => 'Prefers morning appointments.', 'tags' => ['returning'], 'last_service_at' => $date],
                );

                $loyalty = Loyalty::updateOrCreate(
                    ['provider_id' => $provider->id, 'customer_id' => $customer->id],
                    ['points' => 40, 'lifetime_points' => 40],
                );

                LoyaltyTransaction::updateOrCreate(
                    ['loyalty_id' => $loyalty->id, 'booking_id' => $booking->id],
                    ['points' => 40, 'reason' => 'Demo completed booking'],
                );
            }
        }

        foreach ($providers as $provider) {
            $provider->update([
                'rating' => round((float) $provider->reviews()->where('is_approved', true)->avg('rating'), 2),
                'review_count' => $provider->reviews()->where('is_approved', true)->count(),
            ]);
        }

        SavedProvider::updateOrCreate(['customer_id' => $customers[0]->id, 'provider_id' => $providers[0]->id]);
        SavedProvider::updateOrCreate(['customer_id' => $customers[0]->id, 'provider_id' => $providers[1]->id]);
    }

    private function seedContent(User $admin, \Illuminate\Support\Collection $providers, \Illuminate\Support\Collection $customers): void
    {
        $newsItems = [
            ['Beauty professionals shaping Nigeria\'s creative economy', 'beauty-professionals-creative-economy', 'Independent beauty professionals are building sustainable careers, stronger client relationships, and new creative businesses across the country.', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1400&q=80', 1],
            ['Five ways to prepare clients for a flawless appointment', 'prepare-clients-flawless-appointment', 'Simple communication habits that reduce confusion, improve results, and create a calmer client experience.', 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=1400&q=80', 2],
            ['What clients look for before booking a beauty professional', 'what-clients-look-for-before-booking', 'A practical look at the trust signals that help clients choose one professional over another.', 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=1400&q=80', 3],
            ['How beauty businesses can improve retention without discounting', 'beauty-business-retention-without-discounting', 'Retention is built through trust, consistency, follow-up, and a service experience clients want to repeat.', 'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=1400&q=80', 4],
        ];

        foreach ($newsItems as [$title, $slug, $excerpt, $image, $order]) {
            News::updateOrCreate(
                ['slug' => $slug],
                ['is_demo' => true, 'title' => $title, 'excerpt' => $excerpt, 'content' => "<p>{$excerpt}</p><p>This is demo content that can be safely cleared from admin settings.</p>", 'image' => $image, 'author_id' => $admin->id, 'show_on_homepage' => true, 'homepage_sort_order' => $order, 'published_at' => now()->subDays($order * 2)],
            );
        }

        $eventItems = [
            ['BPHQ Business Breakfast', 'bphq-business-breakfast', 'Victoria Island, Lagos', 'A practical morning for beauty founders, independent professionals, educators, and studio owners who want stronger business systems.', 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1400&q=80', 5, 2],
            ['Portfolio Day Abuja', 'portfolio-day-abuja', 'Wuse 2, Abuja', 'Portfolio Day Abuja brings beauty professionals, photographers, stylists, and creative directors together to create clean, portfolio-ready work.', 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=1400&q=80', 6, 4],
            ['Beauty Educator Masterclass: From Skill to Curriculum', 'beauty-educator-masterclass-skill-to-curriculum', 'Online', 'An online masterclass for experienced beauty professionals who want to teach more clearly and structure learning outcomes.', 'https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=80', 7, 5],
            ['Clean Beauty Studio Operations Workshop', 'clean-beauty-studio-operations-workshop', 'Lekki, Lagos', 'A hands-on workshop for salon owners, home-studio professionals, and mobile beauty providers who want cleaner operations.', 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1400&q=80', 8, 7],
        ];

        foreach ($eventItems as [$title, $slug, $location, $description, $image, $order, $weeks]) {
            $event = Event::updateOrCreate(
                ['slug' => $slug],
                ['is_demo' => true, 'title' => $title, 'date' => now()->addWeeks($weeks)->setTime(10, 0), 'location' => $location, 'description' => "<p>{$description}</p>", 'image' => $image, 'registration_url' => 'https://example.com/'.$slug, 'show_on_homepage' => true, 'homepage_sort_order' => $order, 'published_at' => now()],
            );

            foreach ($customers->take(2) as $customer) {
                EventRegistration::updateOrCreate(
                    ['event_id' => $event->id, 'email' => $customer->email],
                    ['user_id' => $customer->id, 'name' => $customer->name, 'phone' => $customer->phone, 'business_name' => 'Demo Beauty Studio', 'professional_role' => 'Beauty professional', 'notes' => 'Demo registration from one-click data.', 'status' => 'registered'],
                );
            }
        }

        foreach ([
            ['Makeup Artists for Fashion Campaign', 'job', 'A Lagos fashion label needs two experienced makeup artists for a two-day campaign shoot.', 'Lagos', 21],
            ['Beauty Educator Masterclass Partnership', 'partnership', 'BeautyPro HQ is selecting experienced beauty educators to co-host practical online masterclasses.', 'Remote', 30],
            ['Nail Technicians for Pop-up Studio', 'vendor_call', 'A weekend beauty pop-up in Abuja is curating nail technicians for express manicure, gel polish, and nail art.', 'Abuja', 14],
        ] as [$title, $type, $description, $location, $days]) {
            Opportunity::updateOrCreate(
                ['title' => $title],
                ['is_demo' => true, 'type' => $type, 'description' => "<p>{$description}</p>", 'contact_info' => ['short_description' => $description, 'email' => 'opportunities@beautyprohq.test'], 'location' => $location, 'deadline' => now()->addDays($days)->toDateString(), 'published_at' => now()],
            );
        }

        foreach ([
            ['From home studio to growing beauty brand', 'A BeautyPro HQ member shares how clear pricing and client communication helped turn a small home studio into a growing beauty business.', 'story', 0],
            ['Pro spotlight: building trust through great client care', 'This spotlight highlights the systems beauty professionals use to make clients feel prepared and confident.', 'spotlight', 1],
            ['Community win: more beauty professionals getting discovered', 'Beauty professionals across the community are improving profiles and creating more visible paths for customers.', 'community', 2],
        ] as [$title, $content, $type, $index]) {
            $provider = $providers->get($index);
            CommunityPost::updateOrCreate(
                ['title' => $title],
                ['is_demo' => true, 'content' => $content, 'type' => $type, 'provider_id' => $provider?->id, 'image' => $provider?->profile_photo, 'published_at' => now()->subDays($index + 1)],
            );
        }

        Announcement::updateOrCreate(
            ['title' => 'BPHQ Demo Platform Notice'],
            ['message' => 'Complete your profile and availability to start receiving bookings.', 'audience' => 'provider', 'published_at' => now()],
        );
        NewsletterSubscriber::updateOrCreate(
            ['email' => 'demo.newsletter@beautyprohq.test'],
            $this->newsletterSubscriberPayload('Demo Newsletter')
        );
    }

    private function newsletterSubscriberPayload(string $name): array
    {
        $payload = ['subscribed_at' => now(), 'unsubscribed_at' => null];

        if (Schema::hasColumn('newsletter_subscribers', 'name')) {
            $payload['name'] = $name;
        }

        return $payload;
    }

    private function categoryForProfession(string $profession): ?ProviderCategory
    {
        $slug = match (true) {
            str_contains(strtolower($profession), 'makeup') => 'makeup-artist',
            str_contains(strtolower($profession), 'hair') || str_contains(strtolower($profession), 'wig') => 'hairstylist',
            str_contains(strtolower($profession), 'nail') => 'nail-technician',
            str_contains(strtolower($profession), 'lash') => 'lash-technician',
            str_contains(strtolower($profession), 'barber') || str_contains(strtolower($profession), 'grooming') => 'barber',
            str_contains(strtolower($profession), 'skin') => 'esthetician-skin-specialist',
            str_contains(strtolower($profession), 'educator') => 'beauty-educator',
            default => 'esthetician-skin-specialist',
        };

        return ProviderCategory::where('slug', $slug)->first() ?? ProviderCategory::updateOrCreate(
            ['slug' => 'demo-'.$slug],
            ['is_demo' => true, 'name' => 'Demo '.str($slug)->replace('-', ' ')->title(), 'description' => 'Temporary demo category created from admin settings.', 'is_active' => true, 'sort_order' => 99],
        );
    }

    private function servicesForIndex(int $index): array
    {
        return match ($index % 4) {
            0 => [['Soft Glam Makeup', 'Makeup', 35000, 90], ['Bridal Makeup', 'Makeup', 120000, 180], ['Makeup Consultation', 'Consultation', 15000, 45]],
            1 => [['Silk Press', 'Hair', 28000, 120], ['Protective Styling', 'Hair', 45000, 180], ['Hair Consultation', 'Consultation', 10000, 30]],
            2 => [['Gel Manicure', 'Nails', 18000, 75], ['Luxury Pedicure', 'Nails', 22000, 90], ['Nail Art Set', 'Nails', 30000, 120]],
            default => [['Skin Consultation', 'Skincare', 15000, 45], ['Signature Facial', 'Skincare', 40000, 90], ['Glow Treatment', 'Skincare', 55000, 120]],
        };
    }

    private function digitalProductForIndex(int $index, string $photo): array
    {
        return match ($index % 5) {
            0 => ['Bridal Prep Checklist', 'A practical checklist for brides preparing for makeup trials and wedding-day glam.', 9500, 'https://example.com/bridal-prep-checklist', $photo],
            1 => ['Healthy Hair Routine Guide', 'A simple routine planner for clients maintaining natural hair between appointments.', 8500, 'https://example.com/healthy-hair-routine', $photo],
            2 => ['Nail Aftercare Mini Guide', 'Care instructions to help clients protect gel sets, extensions, and nail art.', 6500, 'https://example.com/nail-aftercare-guide', $photo],
            3 => ['Glow Skin Prep Guide', 'A pre-facial and post-treatment guide for better skincare results.', 9000, 'https://example.com/glow-skin-prep', $photo],
            default => ['Beauty Client Care Template', 'A reusable client-care message template for beauty professionals.', 7500, 'https://example.com/client-care-template', $photo],
        };
    }

    private function counts(): array
    {
        $demoProviderIds = ProviderProfile::where('is_demo', true)->pluck('id');
        $demoUserIds = User::where('is_demo', true)->pluck('id');

        return [
            'users' => User::where('is_demo', true)->count(),
            'providers' => ProviderProfile::where('is_demo', true)->count(),
            'services' => Service::where('is_demo', true)->count(),
            'bookings' => Booking::where('is_demo', true)->count(),
            'payments' => Payment::whereIn('provider_id', $demoProviderIds)->count(),
            'usage_records' => CrmCustomer::whereIn('provider_id', $demoProviderIds)->count()
                + Loyalty::whereIn('provider_id', $demoProviderIds)->count()
                + SavedProvider::whereIn('provider_id', $demoProviderIds)->orWhereIn('customer_id', $demoUserIds)->count(),
            'content' => News::where('is_demo', true)->count()
                + Event::where('is_demo', true)->count()
                + Opportunity::where('is_demo', true)->count()
                + CommunityPost::where('is_demo', true)->count(),
        ];
    }
}
