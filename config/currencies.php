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
        'EUR' => ['name' => 'Euro', 'symbol' => '€', 'rate' => 0.00054],
        'GBP' => ['name' => 'British Pound', 'symbol' => '£', 'rate' => 0.00047],
    ],
];
