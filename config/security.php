<?php

return [
    'csp' => [
        'enabled' => (bool) env('SECURITY_CSP_ENABLED', true),
        'upgrade_insecure_requests' => (bool) env('SECURITY_UPGRADE_INSECURE_REQUESTS', true),
    ],
    'hsts' => [
        'enabled' => (bool) env('SECURITY_HSTS_ENABLED', true),
        'max_age' => (int) env('SECURITY_HSTS_MAX_AGE', 31536000),
    ],
    'uploads' => [
        'user_quota_bytes' => (int) env('SECURITY_USER_UPLOAD_QUOTA_BYTES', 104857600),
        'admin_quota_bytes' => (int) env('SECURITY_ADMIN_UPLOAD_QUOTA_BYTES', 1073741824),
        'orphan_retention_days' => (int) env('SECURITY_ORPHAN_UPLOAD_RETENTION_DAYS', 7),
        'malware_scan' => [
            'enabled' => (bool) env('SECURITY_MALWARE_SCAN_ENABLED', false),
            'required' => (bool) env('SECURITY_MALWARE_SCAN_REQUIRED', false),
            'host' => env('SECURITY_CLAMD_HOST', '127.0.0.1'),
            'port' => (int) env('SECURITY_CLAMD_PORT', 3310),
            'timeout' => (int) env('SECURITY_CLAMD_TIMEOUT', 15),
        ],
    ],
    'admin_step_up' => [
        'lifetime_seconds' => (int) env('SECURITY_ADMIN_STEP_UP_LIFETIME', 600),
        'require_two_factor' => (bool) env('SECURITY_ADMIN_REQUIRE_TWO_FACTOR', false),
    ],
];
