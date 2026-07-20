<?php

namespace Database\Seeders;

use App\Models\SubscriptionPlan;
use Illuminate\Database\Seeder;

class SubscriptionPlanSeeder extends Seeder
{
    public function run(): void
    {
        SubscriptionPlan::updateOrCreate(
            ['key' => 'free'],
            [
                'name' => 'Free Plan',
                'price' => 0,
                'currency' => 'NGN',
                'billing_period' => 'monthly',
                'sort_order' => 1,
                'is_active' => true,
                'features' => [
                    'Basic directory listing',
                    'Receive client reviews',
                    'Email notifications for account activity',
                ],
            ],
        );

        SubscriptionPlan::updateOrCreate(
            ['key' => 'paid'],
            [
                'name' => 'Pro Plan',
                'price' => 15000,
                'currency' => 'NGN',
                'billing_period' => 'monthly',
                'sort_order' => 2,
                'is_active' => true,
                'features' => [
                    'CRM and customer management',
                    'Loyalty points and reward tracking',
                    'Direct booking requests',
                    'Payment gateway connection',
                    'External store and digital product links',
                    'Monthly content calendar',
                    'Upgrade or downgrade anytime',
                ],
            ],
        );
    }
}
