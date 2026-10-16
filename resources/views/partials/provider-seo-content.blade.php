<main style="max-width: 960px; margin: 0 auto; padding: 2rem 1rem; font-family: sans-serif; line-height: 1.6">
    <nav aria-label="Breadcrumb"><a href="{{ url('/') }}">BeautyPro HQ</a> / <a href="{{ url('/directory') }}">Beauty professionals</a> / {{ $seoProviderName }}</nav>
    <article>
        <h1>{{ $seoProviderName }} - {{ $seoProviderProfession }} in {{ $seoProviderLocation }}</h1>
        @if($pageImage)
            <img src="{{ $pageImage }}" alt="{{ $seoProviderName }}" style="max-width: 100%; max-height: 360px; object-fit: cover" loading="lazy">
        @endif
        <p>{{ $seoProviderProfession }} in {{ $seoProviderLocation }}</p>
        @if($seoProvider->bio)
            <section aria-label="About {{ $seoProviderName }}">
                <h2>About {{ $seoProviderName }}</h2>
                <p>{!! nl2br(e(trim(strip_tags($seoProvider->bio)))) !!}</p>
            </section>
        @endif
        @if($seoProvider->services->isNotEmpty())
            <section aria-label="Services">
                <h2>Services</h2>
                <ul>
                    @foreach($seoProvider->services as $service)
                        <li>{{ $service->name }}@if($service->description) — {{ trim(strip_tags($service->description)) }}@endif</li>
                    @endforeach
                </ul>
            </section>
        @endif
        <p><a href="{{ $pageCanonical }}">View {{ $seoProviderName }}'s profile and book a service</a></p>
    </article>
</main>
