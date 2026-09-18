<?php

return [
    'default' => env('APP_DEFAULT_CURRENCY', 'NGN'),

    /*
    |--------------------------------------------------------------------------
    | Supported display and pricing currencies
    |--------------------------------------------------------------------------
    |
    | Rates are display-only fallbacks against NGN. Payment/settlement should
    | still use the stored plan/service currency unless a gateway conversion
    | is explicitly implemented.
    |
    */
    'supported' => [
        'NGN' => ['name' => 'Nigerian Naira', 'symbol' => '₦', 'rate' => 1],
        'USD' => ['name' => 'US Dollar', 'symbol' => '$', 'rate' => 0.00063],
        // Display-only fallback rates for currencies present in the imported listings.
        // XE mid-market units per NGN on 2026-09-16; admins can update saved rates.
        'AED' => ['name' => 'UAE Dirham', 'symbol' => 'د.إ', 'rate' => 0.0027672033],
        'CAD' => ['name' => 'Canadian Dollar', 'symbol' => 'C$', 'rate' => 0.0010499985],
        'GHS' => ['name' => 'Ghanaian Cedi', 'symbol' => 'GH₵', 'rate' => 0.0086546587],
        'INR' => ['name' => 'Indian Rupee', 'symbol' => '₹', 'rate' => 0.0722636115],
        'ZAR' => ['name' => 'South African Rand', 'symbol' => 'R', 'rate' => 0.0122558071],
        'EUR' => ['name' => 'Euro', 'symbol' => '€', 'rate' => 0.00054],
        'GBP' => ['name' => 'British Pound', 'symbol' => '£', 'rate' => 0.00047],
    ],
];
