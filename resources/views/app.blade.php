<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#531c3f">
    <meta name="description" content="{{ $pageDescription ?? 'BeautyPro HQ connects customers with trusted beauty professionals and gives providers the tools to grow.' }}">
    <title>{{ $pageTitle ?? 'BeautyPro HQ' }}</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <style>
        @font-face{font-family:'Inter';font-style:normal;font-weight:400 800;font-display:swap;src:url('https://fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
        @font-face{font-family:'Playfair Display';font-style:normal;font-weight:400 900;font-display:swap;src:url('https://fonts.gstatic.com/s/playfairdisplay/v40/nuFiD-vYSZviVYUb_rj3ij__anPXDTzYgEM86xQ.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
    </style>
    @isset($heroPreload)
        @unless($heroPreload['inline'] ?? false)
            <link rel="preconnect" href="https://images.unsplash.com" crossorigin>
            <link rel="preload" as="image" href="{{ $heroPreload['src'] }}" @isset($heroPreload['srcset']) imagesrcset="{{ $heroPreload['srcset'] }}" imagesizes="{{ $heroPreload['sizes'] }}" @endisset fetchpriority="high">
        @endunless
        @unless(($homepageShell ?? false) && ($heroPreload['inline'] ?? false))
            <script>window.__BPHQ_HERO_IMAGES__ = @json($heroPreload['initialImages']);</script>
        @endunless
    @endisset
    @if($homepageShell ?? false)
        <script>window.__BPHQ_FIRST_PAINT__ = true;</script>
    @endif
    @viteReactRefresh
    @if(($inlineHomepageCss ?? false) && ! \Illuminate\Support\Facades\Vite::isRunningHot())
        <style data-app-css>{!! \Illuminate\Support\Facades\Vite::content('resources/css/app.css') !!}</style>
        @vite(['resources/js/main.jsx'])
    @else
        @vite(['resources/css/app.css', 'resources/js/main.jsx'])
    @endif
</head>
<body>
    <div id="root">
        @if($homepageShell ?? false)
            @include('partials.home-shell', ['images' => $heroShellImages ?? []])
        @endif
    </div>
    @if(($homepageShell ?? false) && ($heroPreload['inline'] ?? false))
        <script>
            window.__BPHQ_HERO_IMAGES__ = [
                document.querySelector('[data-bphq-lcp]')?.getAttribute('src'),
                ...@json(array_slice($heroPreload['initialImages'], 1)),
            ].filter(Boolean);
        </script>
    @endif
</body>
</html>
