<main style="max-width: 960px; margin: 0 auto; padding: 2rem 1rem; font-family: sans-serif; line-height: 1.6">
    <h1>Find beauty professionals</h1>
    <p>Explore listed beauty professionals and their services on BeautyPro HQ.</p>
    @if($seoDirectoryProviders->isNotEmpty())
        <ul>
            @foreach($seoDirectoryProviders as $provider)
                <li><a href="{{ url('/providers/'.$provider->slug) }}">{{ $provider->user?->name ?: 'Beauty professional' }} — {{ $provider->profession ?: $provider->category?->name ?: 'Beauty professional' }}@if($provider->city) in {{ $provider->city }}@endif</a></li>
            @endforeach
        </ul>
    @endif
</main>
