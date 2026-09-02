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
    ],
];
