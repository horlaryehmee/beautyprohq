<?php

namespace Database\Seeders;

use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class LiveReviewSeeder extends Seeder
{
    public function run(): void
    {
        $customers = collect([
            ['name' => 'Ada Okafor', 'email' => 'ada.customer@beautyprohq.com'],
            ['name' => 'Tomi Adebayo', 'email' => 'tomi.customer@beautyprohq.com'],
            ['name' => 'Zainab Bello', 'email' => 'zainab.customer@beautyprohq.com'],
            ['name' => 'Chioma Eze', 'email' => 'chioma.customer@beautyprohq.com'],
            ['name' => 'Morenike Salami', 'email' => 'morenike.customer@beautyprohq.com'],
        ])->map(fn (array $customer) => User::firstOrCreate(
            ['email' => $customer['email']],
            [
                'name' => $customer['name'],
                'password' => 'password',
                'role' => 'customer',
                'email_verified_at' => now(),
            ],
        ))->values();

        if ($customers->isEmpty()) {
            $this->command?->warn('No customers available for review seeding.');

            return;
        }

        $comments = [
            [5, 'Very professional service. The final result was clean, beautiful, and exactly what I wanted.'],
            [5, 'Great communication before the appointment and a calm, comfortable experience throughout.'],
            [4, 'Loved the attention to detail. I would happily recommend this professional to others.'],
            [5, 'Arrived prepared, understood the brief, and delivered a polished result.'],
            [4, 'The service was smooth and the after-care advice was very helpful.'],
            [5, 'Excellent work and a friendly experience from start to finish.'],
            [5, 'Everything felt organized, timely, and client-focused.'],
            [4, 'Strong service quality and a lovely finish. I would book again.'],
        ];

        $providers = ProviderProfile::query()
            ->where('is_listed', true)
            ->with('user:id,name')
            ->orderByDesc('verified')
            ->orderBy('id')
            ->get();

        if ($providers->isEmpty()) {
            $this->command?->warn('No listed providers found for review seeding.');

            return;
        }

        DB::transaction(function () use ($providers, $customers, $comments): void {
            foreach ($providers as $providerIndex => $provider) {
                foreach (range(0, 2) as $offset) {
                    [$rating, $comment] = $comments[($providerIndex + $offset) % count($comments)];
                    $customer = $customers[($providerIndex + $offset) % $customers->count()];

                    Review::firstOrCreate(
                        [
                            'provider_id' => $provider->id,
                            'customer_id' => $customer->id,
                            'comment' => $comment,
                        ],
                        [
                            'booking_id' => null,
                            'rating' => $rating,
                            'is_approved' => true,
                            'created_at' => now()->subDays(($providerIndex * 3) + $offset + 1),
                            'updated_at' => now()->subDays(($providerIndex * 3) + $offset + 1),
                        ],
                    );
                }

                $provider->recalculateRating();
            }
        });

        $this->command?->info('Live review data seeded and provider ratings recalculated.');
    }
}
