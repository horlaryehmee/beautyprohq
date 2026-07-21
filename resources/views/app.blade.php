<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="theme-color" content="#531c3f">
    <meta name="description" content="BeautyPro HQ connects customers with trusted beauty professionals and gives providers the tools to grow.">
    <title>BeautyPro HQ</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    @isset($heroPreload)
        <link rel="preconnect" href="https://images.unsplash.com" crossorigin>
        <link rel="preload" as="image" href="{{ $heroPreload['src'] }}" @isset($heroPreload['srcset']) imagesrcset="{{ $heroPreload['srcset'] }}" imagesizes="{{ $heroPreload['sizes'] }}" @endisset fetchpriority="high">
        <script>window.__BPHQ_HERO_IMAGES__ = @json($heroPreload['initialImages']);</script>
    @endisset
    <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@400;600;700;800;900&display=swap" onload="this.onload=null;this.rel='stylesheet'">
    <noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@400;600;700;800;900&display=swap" rel="stylesheet"></noscript>
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.jsx'])
</head>
<body>
    <div id="root"></div>
</body>
</html>
