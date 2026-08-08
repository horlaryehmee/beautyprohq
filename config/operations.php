<?php

return [
    'slow_request_ms' => (int) env('SLOW_REQUEST_THRESHOLD_MS', 1500),
    'health_cache_key' => env('HEALTH_CACHE_KEY', 'health:last-check'),
];
