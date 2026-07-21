import { useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn, mediaUrl, responsiveImage } from '../../lib/utils';
import DeferredImage from './DeferredImage';
import Icon from './Icon';

const fallbackSquares = [
    { id: 'fallback-1', src: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-2', src: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-3', src: 'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-4', src: 'https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-5', src: 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-6', src: 'https://images.unsplash.com/photo-1515377905703-c4788e51af15?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-7', src: 'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-8', src: 'https://images.unsplash.com/photo-1559599101-f09722fb4948?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-9', src: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-10', src: 'https://images.unsplash.com/photo-1580618672591-eb180b1a973f?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-11', src: 'https://images.unsplash.com/photo-1526045478516-99145907023c?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-12', src: 'https://images.unsplash.com/photo-1488282396544-0212eea56a21?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-13', src: 'https://images.unsplash.com/photo-1519415943484-9fa1873496d4?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-14', src: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-15', src: 'https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-16', src: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=80' },
];

function providerSquares(providers = []) {
    const photos = providers
        .map((provider) => ({
            id: `provider-${provider.id ?? provider.user_id ?? provider.slug}`,
            src: mediaUrl(provider.profile_photo_url ?? provider.profile_photo ?? provider.photo ?? provider.avatar),
        }))
        .filter((item) => item.src);

    const seededPhotos = !photos.length && Array.isArray(globalThis.__BPHQ_HERO_IMAGES__)
        ? globalThis.__BPHQ_HERO_IMAGES__.map((src, index) => ({ id: `preloaded-provider-${index}`, src: mediaUrl(src) })).filter((item) => item.src)
        : [];

    return [...photos, ...seededPhotos, ...fallbackSquares].slice(0, 16);
}

function CountUp({ end, suffix = '+' }) {
    const valueRef = useRef(null);
    const finalValue = `${end.toLocaleString()}${suffix}`;

    useEffect(() => {
        let frame;
        let startTimer;
        const duration = 1200;

        function begin() {
            const startedAt = performance.now();

            function tick(now) {
                const progress = Math.min((now - startedAt) / duration, 1);
                const eased = 1 - Math.pow(1 - progress, 3);
                if (valueRef.current) valueRef.current.textContent = `${Math.round(end * eased).toLocaleString()}${suffix}`;
                if (progress < 1) frame = requestAnimationFrame(tick);
            }

            frame = requestAnimationFrame(tick);
        }

        const schedule = () => { startTimer = window.setTimeout(begin, 1800); };
        if (document.readyState === 'complete') schedule();
        else window.addEventListener('load', schedule, { once: true });

        return () => {
            window.removeEventListener('load', schedule);
            window.clearTimeout(startTimer);
            cancelAnimationFrame(frame);
        };
    }, [end, suffix]);

    return (
        <span className="inline-grid" aria-label={finalValue}>
            <span className="invisible col-start-1 row-start-1" aria-hidden="true">{finalValue}</span>
            <span ref={valueRef} className="col-start-1 row-start-1" aria-hidden="true">0{suffix}</span>
        </span>
    );
}

function HeroImageMarquee({ providers }) {
    const squareData = useMemo(() => providerSquares(providers), [providers]);
    const leftColumn = [...squareData.filter((_, index) => index % 2 === 0), ...squareData.filter((_, index) => index % 2 === 0)];
    const rightColumn = [...squareData.filter((_, index) => index % 2 !== 0), ...squareData.filter((_, index) => index % 2 !== 0)];
    const columns = [
        { id: 'left', items: leftColumn, direction: -1, className: 'pt-12 md:pt-20' },
        { id: 'right', items: rightColumn, direction: 1, className: '-mt-20 md:-mt-28' },
    ];

    if (!squareData.length) return null;

    return (
        <div className="relative mx-auto h-[360px] w-full max-w-[500px] overflow-hidden rounded-[1.6rem] sm:h-[430px] md:h-[540px] md:rounded-[2rem] lg:h-[620px]">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#f4efe9] to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#f4efe9] to-transparent" />
            <div className="grid h-full grid-cols-2 gap-3 sm:gap-4">
                {columns.map((column) => (
                    <div
                        className={cn('flex flex-col gap-3 sm:gap-4', column.className, column.direction === -1 ? 'hero-marquee-up' : 'hero-marquee-down')}
                        key={column.id}
                    >
                        {column.items.map((item, index) => {
                            const repeatedAt = column.items.length / 2;
                            const isInitiallyVisible = column.direction === -1
                                ? index < 2
                                : index >= repeatedAt && index < repeatedAt + 2;
                            const isLcpImage = column.direction === -1 && index === 0;
                            const source = responsiveImage(item.src, {
                                widths: [280, 400, 560],
                                sizes: '(min-width: 768px) 25vw, 50vw',
                                quality: 70,
                            });
                            return (
                                <div className="h-40 shrink-0 overflow-hidden rounded-[1.1rem] bg-[#ddd3c8] shadow-[0_18px_45px_rgba(64,42,32,.12)] ring-1 ring-white/60 sm:h-56 sm:rounded-[1.35rem] md:h-64" key={`${column.id}-${item.id}-${index}`}>
                                    <DeferredImage
                                        {...source}
                                        alt=""
                                        className="size-full object-cover"
                                        loading={isInitiallyVisible ? 'eager' : 'lazy'}
                                        rootMargin="320px"
                                        fetchPriority={isLcpImage ? 'high' : 'low'}
                                        onError={(event) => {
                                            const fallback = responsiveImage(fallbackSquares[index % fallbackSquares.length].src, { widths: [400], quality: 70 }).src;
                                            event.currentTarget.srcset = '';
                                            if (event.currentTarget.src !== fallback) event.currentTarget.src = fallback;
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ShuffleHero({ providers = [], className }) {
    return (
        <section className={cn('bg-[#f4efe9] text-[#34231c]', className)}>
            <div className="page-container grid grid-cols-1 items-center gap-7 pb-8 pt-12 sm:pt-16 md:min-h-[520px] md:grid-cols-[.94fr_1.06fr] md:gap-8 md:pb-10 md:pt-20 lg:gap-12 lg:pb-14 lg:pt-24">
                <div className="hero-copy-enter">
                    <h1 className="mx-auto mt-2 max-w-[620px] text-center font-display text-[3rem] font-normal leading-[.9] text-[#34231c] sm:text-[3.7rem] md:mx-0 md:mt-0 md:text-left md:text-[clamp(2.75rem,6.5vw,5.2rem)]">
                        <span>The Beauty Service </span>
                        <span className="block font-serif italic text-[#d96f53]">Ecosystem</span>
                    </h1>
                    <p className="hero-tagline-cycle mt-3 text-center font-display text-xl font-normal md:text-left sm:text-3xl">
                        Connect. Discover. Grow.
                    </p>
                    <p className="mx-auto mt-3 max-w-xl text-center text-sm font-normal leading-6 text-[#5a4d46] md:mx-0 md:text-left md:text-lg md:leading-7">
                        Discover trusted beauty professionals, stay updated on industry news and events, and connect with opportunities across the beauty industry.
                    </p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3 md:justify-start">
                        <Link
                            to="/register"
                            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#2d1d16] px-7 text-xs font-black uppercase tracking-wide text-white transition hover:bg-[#4a3328] active:scale-95"
                        >
                            Join BPHQ <Icon name="arrow" size={14} />
                        </Link>
                        <Link
                            to="/directory"
                            className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#cfc5bb] bg-[#fbf7f1] px-7 text-xs font-black uppercase tracking-wide text-[#34231c] transition hover:bg-white active:scale-95"
                        >
                            Explore Directory
                        </Link>
                    </div>
                    <div className="mx-auto mt-7 flex max-w-full items-center overflow-x-auto pb-1 md:mx-0 md:overflow-visible">
                        <div className="flex w-max items-center whitespace-nowrap">
                            {[
                                [500, 'Beauty Pros'],
                                [50, 'Cities'],
                                [100, 'Resources'],
                                [25, 'Events'],
                            ].map(([value, label], index) => (
                                <div className="flex items-center" key={label}>
                                    {index > 0 && <span className="mx-5 h-8 w-px bg-gradient-to-b from-transparent via-[#cbb9ab] to-transparent" />}
                                    <span className="inline-flex flex-col gap-1">
                                        <span className="font-display text-2xl font-semibold leading-none text-[#34231c]">
                                            <CountUp end={value} />
                                        </span>
                                        <span className="text-[10px] font-black uppercase tracking-[.15em] text-[#7b6b61]">{label}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="mx-auto w-full md:max-w-none"><HeroImageMarquee providers={providers} /></div>
            </div>
        </section>
    );
}
