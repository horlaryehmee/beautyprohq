@php
    $appName = \App\Models\AppSetting::getValue('branding.site_name', config('app.name', 'BeautyPro HQ'));
    $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');
    $emailLogo = \App\Models\AppSetting::getValue('branding.email_logo_url', \App\Models\AppSetting::getValue('branding.logo_url', '/brand/bphq-logo-transparent.svg'));
    if ($emailLogo && str_starts_with($emailLogo, '/')) {
        $emailLogo = $frontendUrl.$emailLogo;
    }
    $brand = '#3A2A1F';
    $ink = '#2A1D14';
    $muted = '#5B4A3C';
    $border = '#BFC3C8';
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $appName }}</title>
</head>
<body style="margin:0;background:#F7F3ED;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:{{ $ink }};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F7F3ED;padding:30px 14px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
                    <tr>
                        <td style="overflow:hidden;border-radius:24px;background:#FFFFFF;box-shadow:0 22px 70px rgba(42,29,20,.10);border:1px solid {{ $border }};">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:{{ $ink }};">
                                <tr>
                                    <td style="padding:18px 26px;">
                                        <a href="{{ $frontendUrl }}" style="display:inline-block;text-decoration:none;color:#FFFFFF;">
                                            <table role="presentation" cellspacing="0" cellpadding="0">
                                                <tr>
                                                    @if($emailLogo)
                                                        <td style="padding:0 14px 0 0;vertical-align:middle;">
                                                            <img src="{{ $emailLogo }}" alt="{{ $appName }}" width="54" style="display:block;max-width:54px;width:54px;height:auto;border:0;outline:none;text-decoration:none;">
                                                        </td>
                                                    @endif
                                                    <td style="vertical-align:middle;">
                                                        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.05;font-weight:500;letter-spacing:0;color:#FFFFFF;">{{ $appName }}</div>
                                                        <div style="margin-top:5px;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#EADFD5;">Notification</div>
                                                    </td>
                                                </tr>
                                            </table>
                                        </a>
                                    </td>
                                </tr>
                            </table>
                            <div style="padding:34px 30px 16px;">
                                @if (! empty($greeting))
                                    <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:500;color:{{ $ink }};">{{ $greeting }}</h1>
                                @else
                                    <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.15;font-weight:500;color:{{ $ink }};">Hello,</h1>
                                @endif

                                @foreach ($introLines as $line)
                                    <p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:{{ $muted }};">{{ $line }}</p>
                                @endforeach

                                @isset($actionText)
                                    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;">
                                        <tr>
                                            <td>
                                                <a href="{{ $actionUrl }}" style="display:inline-block;border-radius:999px;background:{{ $brand }};color:#FFFFFF;text-decoration:none;padding:14px 22px;font-size:14px;font-weight:700;letter-spacing:.2px;">{{ $actionText }}</a>
                                            </td>
                                        </tr>
                                    </table>
                                @endisset

                                @foreach ($outroLines as $line)
                                    <p style="margin:0 0 14px;font-size:15px;line-height:1.75;color:{{ $muted }};">{{ $line }}</p>
                                @endforeach

                                @if (! empty($salutation))
                                    <p style="margin:22px 0 0;font-size:15px;line-height:1.7;color:{{ $ink }};">{{ $salutation }}</p>
                                @else
                                    <p style="margin:22px 0 0;font-size:15px;line-height:1.7;color:{{ $ink }};">Regards,<br>{{ $appName }}</p>
                                @endif
                            </div>

                            @isset($actionText)
                                <div style="padding:0 30px 30px;">
                                    <div style="border-top:1px solid #F7F3ED;padding-top:18px;">
                                        <p style="margin:0;font-size:12px;line-height:1.7;color:#7D7168;">If the button does not work, copy and paste this link into your browser:</p>
                                        <p style="margin:8px 0 0;word-break:break-all;font-size:12px;line-height:1.7;color:#3A2A1F;">{{ $actionUrl }}</p>
                                    </div>
                                </div>
                            @endisset
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px;text-align:center;">
                            <p style="margin:0;font-size:12px;line-height:1.7;color:#7D7168;">{{ $appName }} &middot; trusted beauty professionals, bookings, payments and growth tools.</p>
                            <p style="margin:8px 0 0;font-size:12px;color:#7D7168;">&copy; {{ date('Y') }} {{ $appName }}. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
