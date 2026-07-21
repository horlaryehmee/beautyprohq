@php
    $shellImages = collect($images)->values();
    $leftImages = $shellImages->filter(fn ($image, $index) => $index % 2 === 0)->values();
    $rightImages = $shellImages->filter(fn ($image, $index) => $index % 2 !== 0)->values();
    $columns = [
        ['id' => 'left', 'items' => $leftImages->concat($leftImages)->values(), 'class' => 'pt-12 md:pt-20', 'direction' => 'up'],
        ['id' => 'right', 'items' => $rightImages->concat($rightImages)->values(), 'class' => '-mt-20 md:-mt-28', 'direction' => 'down'],
    ];
@endphp

<div class="min-h-screen bg-cream-50 text-plum-950" data-bphq-first-paint>
    <header class="sticky top-0 z-50 border-b border-stone-200/70 bg-[#fbf8f4]/96 shadow-[0_8px_28px_rgba(52,35,28,.06)] backdrop-blur-xl lg:hidden">
        <div class="flex h-16 items-center justify-between px-4">
            <button type="button" tabindex="-1" class="grid size-10 place-items-center rounded-2xl border border-stone-200 bg-white text-[#26211e]" aria-label="Open navigation">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
            <a href="/" class="inline-flex scale-90 flex-col items-center leading-none" aria-label="BeautyPro HQ home">
                <span class="font-display text-[2.15rem] font-normal tracking-[-.08em] text-[#26211e]">BPHQ</span>
                <span class="mt-1 text-[10px] font-black uppercase tracking-[.42em] text-stone-500">BEAUTYPROHQ</span>
            </a>
            <a href="/login" class="grid size-10 place-items-center rounded-2xl border border-stone-200 bg-white text-[#26211e]" aria-label="Account">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>
            </a>
        </div>
    </header>

    <header class="sticky top-0 z-50 hidden border-b border-transparent bg-cream-50/80 backdrop-blur-md lg:block">
        <div class="page-container flex h-18 items-center justify-between gap-5">
            <a href="/" class="inline-flex flex-col items-center leading-none" aria-label="BeautyPro HQ home">
                <span class="font-display text-[2.15rem] font-normal tracking-[-.08em] text-[#26211e]">BPHQ</span>
                <span class="mt-1 text-[10px] font-black uppercase tracking-[.42em] text-stone-500">BEAUTYPROHQ</span>
            </a>
            <nav class="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
                <a href="/" class="rounded-lg bg-white px-3.5 py-2 text-sm font-bold text-plum-900 shadow-sm">Home</a>
                <a href="/news" class="rounded-lg px-3.5 py-2 text-sm font-bold text-stone-600 transition hover:bg-white hover:text-plum-900">News</a>
                <a href="/events" class="rounded-lg px-3.5 py-2 text-sm font-bold text-stone-600 transition hover:bg-white hover:text-plum-900">Events</a>
                <a href="/directory" class="rounded-lg px-3.5 py-2 text-sm font-bold text-stone-600 transition hover:bg-white hover:text-plum-900">Directory</a>
                <a href="mailto:hello@beautyprohq.com" class="rounded-lg px-3.5 py-2 text-sm font-bold text-stone-600 transition hover:bg-white hover:text-plum-900">Get In Touch</a>
            </nav>
            <div class="hidden items-center gap-2 lg:flex">
                <a href="/login" class="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-bold text-plum-800 transition duration-200 hover:bg-plum-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-plum-200">Login</a>
                <a href="/register" class="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl bg-plum-900 px-3.5 text-xs font-bold text-white shadow-[0_10px_24px_rgba(74,32,62,.18)] transition duration-200 hover:bg-plum-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-plum-300">Join BPHQ</a>
            </div>
        </div>
    </header>

    <main class="pb-20 lg:pb-0">
        <section class="bg-[#f4efe9] text-[#34231c]">
            <div class="page-container grid grid-cols-1 items-center gap-7 pb-8 pt-12 sm:pt-16 md:min-h-[520px] md:grid-cols-[.94fr_1.06fr] md:gap-8 md:pb-10 md:pt-20 lg:gap-12 lg:pb-14 lg:pt-24">
                <div class="hero-copy-enter">
                    <h1 class="mx-auto mt-2 max-w-[620px] text-center font-display text-[3rem] font-normal leading-[.9] text-[#34231c] sm:text-[3.7rem] md:mx-0 md:mt-0 md:text-left md:text-[clamp(2.75rem,6.5vw,5.2rem)]">
                        <span>The Beauty Service </span>
                        <span class="block font-serif italic text-[#d96f53]">Ecosystem</span>
                    </h1>
                    <p class="hero-tagline-cycle mt-3 text-center font-display text-xl font-normal sm:text-3xl md:text-left">Connect. Discover. Grow.</p>
                    <p class="mx-auto mt-3 max-w-xl text-center text-sm font-normal leading-6 text-[#5a4d46] md:mx-0 md:text-left md:text-lg md:leading-7">
                        Discover trusted beauty professionals, stay updated on industry news and events, and connect with opportunities across the beauty industry.
                    </p>
                    <div class="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                        <a href="/register" class="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#2d1d16] px-7 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#4a3328] active:scale-95">
                            Join BPHQ
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></svg>
                        </a>
                        <a href="/directory" class="inline-flex min-h-12 items-center justify-center rounded-md border border-[#cfc5bb] bg-[#fbf7f1] px-7 text-xs font-black uppercase tracking-wide text-[#34231c] transition hover:bg-white active:scale-95">Explore Directory</a>
                    </div>
                    <div class="mx-auto mt-7 flex max-w-full items-center overflow-x-auto pb-1 md:mx-0 md:overflow-visible">
                        <div class="flex w-max items-center whitespace-nowrap">
                            @foreach([[500, 'Beauty Pros'], [50, 'Cities'], [100, 'Resources'], [25, 'Events']] as [$value, $label])
                                <div class="flex items-center">
                                    @if(!$loop->first)<span class="mx-5 h-8 w-px bg-gradient-to-b from-transparent via-[#cbb9ab] to-transparent"></span>@endif
                                    <span class="inline-flex flex-col gap-1">
                                        <span class="font-display text-2xl font-semibold leading-none text-[#34231c]">
                                            <span class="inline-grid" aria-label="{{ $value }}+"><span class="invisible col-start-1 row-start-1" aria-hidden="true">{{ $value }}+</span><span class="col-start-1 row-start-1" aria-hidden="true">0+</span></span>
                                        </span>
                                        <span class="text-[10px] font-black uppercase tracking-[.15em] text-[#7b6b61]">{{ $label }}</span>
                                    </span>
                                </div>
                            @endforeach
                        </div>
                    </div>
                </div>

                <div class="mx-auto w-full md:max-w-none">
                    <div class="relative mx-auto h-[360px] w-full max-w-[500px] overflow-hidden rounded-[1.6rem] sm:h-[430px] md:h-[540px] md:rounded-[2rem] lg:h-[620px]">
                        <div class="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#f4efe9] to-transparent"></div>
                        <div class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#f4efe9] to-transparent"></div>
                        <div class="grid h-full grid-cols-2 gap-3 sm:gap-4">
                            @foreach($columns as $column)
                                @php
                                    $half = intdiv($column['items']->count(), 2);
                                @endphp
                                <div class="flex flex-col gap-3 sm:gap-4 {{ $column['class'] }} {{ $column['direction'] === 'up' ? 'hero-marquee-up' : 'hero-marquee-down' }}">
                                    @foreach($column['items'] as $index => $image)
                                        @php
                                            $visible = $column['direction'] === 'up'
                                                ? $index < 2
                                                : $index >= $half && $index < $half + 2;
                                            $lcp = $column['direction'] === 'up' && $index === 0;
                                        @endphp
                                        <div class="h-40 shrink-0 overflow-hidden rounded-[1.1rem] bg-[#ddd3c8] shadow-[0_18px_45px_rgba(64,42,32,.12)] ring-1 ring-white/60 sm:h-56 sm:rounded-[1.35rem] md:h-64">
                                            @if($visible)
                                                <img src="{{ $image['src'] }}" @isset($image['srcset']) srcset="{{ $image['srcset'] }}" sizes="{{ $image['sizes'] }}" @endisset @if($lcp) data-bphq-lcp @else onerror="this.onerror=null;this.src=document.querySelector('[data-bphq-lcp]').src" @endif loading="eager" decoding="async" fetchpriority="{{ $lcp ? 'high' : 'low' }}" alt="" class="size-full object-cover">
                                            @endif
                                        </div>
                                    @endforeach
                                </div>
                            @endforeach
                        </div>
                    </div>
                </div>
            </div>
        </section>
        <div class="min-h-[900px] bg-white" aria-hidden="true"></div>
    </main>

    <nav aria-label="Mobile navigation" class="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-[80] translate-y-0 opacity-100 transition-all duration-300 ease-out lg:hidden">
        <div class="mx-auto flex w-fit max-w-full items-center justify-center gap-1 rounded-2xl border border-stone-200/90 bg-white/95 p-1.5 shadow-[0_12px_40px_rgba(41,19,31,.18)] backdrop-blur-xl">
            <a href="/" aria-current="page" aria-label="Home" class="relative flex h-11 min-w-10 items-center justify-center gap-1.5 rounded-xl bg-rose-50 px-3 text-xs font-black text-rose-600">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                <span class="max-w-24 overflow-hidden whitespace-nowrap opacity-100">Home</span>
            </a>
            <a href="/news" aria-label="News" class="relative flex h-11 min-w-10 items-center justify-center gap-0 rounded-xl px-[.55rem] text-xs font-black text-stone-500">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18h-5"/><path d="M18 14h-8"/><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="10" y="6" rx="1"/></svg>
            </a>
            <a href="/events" aria-label="Events" class="relative flex h-11 min-w-10 items-center justify-center gap-0 rounded-xl px-[.55rem] text-xs font-black text-stone-500">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/></svg>
            </a>
            <a href="/directory" aria-label="Directory" class="relative flex h-11 min-w-10 items-center justify-center gap-0 rounded-xl px-[.55rem] text-xs font-black text-stone-500">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>
            </a>
            <span aria-hidden="true" class="relative flex h-11 min-w-10 items-center justify-center gap-0 rounded-xl px-[.55rem] text-stone-500">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/></svg>
            </span>
            <span aria-hidden="true" class="relative flex h-11 min-w-10 items-center justify-center gap-0 rounded-xl px-[.55rem] text-stone-500">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16M4 12h16M4 19h16"/></svg>
            </span>
        </div>
    </nav>
</div>
