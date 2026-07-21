@php
    $appName = config('app.name', 'BeautyPro HQ');
    $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');
    $brand = '#8b2f45';
    $ink = '#2b1b17';
    $muted = '#7b716d';
@endphp
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $appName }}</title>
</head>
<body style="margin:0;background:#f6f1ec;padding:0;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;color:{{ $ink }};">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1ec;padding:32px 14px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;">
                    <tr>
                        <td style="padding:0 0 18px;text-align:center;">
                            <a href="{{ $frontendUrl }}" style="text-decoration:none;color:{{ $ink }};">
                                <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1;font-weight:500;letter-spacing:-1px;">BPHQ</div>
                                <div style="margin-top:6px;font-size:12px;font-weight:800;letter-spacing:5px;color:#8a817c;">BEAUTYPROHQ</div>
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style="overflow:hidden;border-radius:28px;background:#fff;box-shadow:0 22px 70px rgba(43,27,23,.10);border:1px solid rgba(139,47,69,.10);">
                            <div style="height:8px;background:linear-gradient(90deg,#8b2f45,#d56b82,#34231c);"></div>
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
                                                <a href="{{ $actionUrl }}" style="display:inline-block;border-radius:999px;background:{{ $brand }};color:#fff;text-decoration:none;padding:14px 22px;font-size:14px;font-weight:800;letter-spacing:.2px;">{{ $actionText }}</a>
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
                                    <div style="border-top:1px solid #eee3db;padding-top:18px;">
                                        <p style="margin:0;font-size:12px;line-height:1.7;color:#a59b95;">If the button does not work, copy and paste this link into your browser:</p>
                                        <p style="margin:8px 0 0;word-break:break-all;font-size:12px;line-height:1.7;color:#8b2f45;">{{ $actionUrl }}</p>
                                    </div>
                                </div>
                            @endisset
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:20px;text-align:center;">
                            <p style="margin:0;font-size:12px;line-height:1.7;color:#9b918c;">{{ $appName }} · trusted beauty professionals, bookings, payments and growth tools.</p>
                            <p style="margin:8px 0 0;font-size:12px;color:#b0a6a0;">© {{ date('Y') }} {{ $appName }}. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
