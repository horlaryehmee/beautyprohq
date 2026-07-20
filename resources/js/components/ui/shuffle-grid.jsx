import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cn, mediaUrl } from '../../lib/utils';
import Icon from './Icon';

const fallbackSquares = [
    { id: 'fallback-1', src: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=80' },
    { id: 'fallback-2', src: 'https://images.unsplash.com/photo-1560066984-138dadb4c035a?auto=format&fit=crop&w=900&q=80' },
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

    return [...photos, ...fallbackSquares].slice(0, 16);
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
        <div className="relative mx-auto h-[430px] w-full max-w-[500px] overflow-hidden rounded-[2rem] md:h-[540px] lg:h-[620px]">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#f4efe9] to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-[#f4efe9] to-transparent" />
            <div className="grid h-full grid-cols-2 gap-3 sm:gap-4">
                {columns.map((column) => (
                    <motion.div
                        animate={{ y: column.direction === -1 ? ['0%', '-50%'] : ['-50%', '0%'] }}
                        className={cn('flex flex-col gap-3 sm:gap-4', column.className)}
                        key={column.id}
                        transition={{ duration: 34, ease: 'linear', repeat: Infinity }}
                    >
                        {column.items.map((item, index) => (
                            <div className="h-44 shrink-0 overflow-hidden rounded-[1.35rem] bg-[#ddd3c8] shadow-[0_18px_45px_rgba(64,42,32,.12)] ring-1 ring-white/60 sm:h-56 md:h-64" key={`${column.id}-${item.id}-${index}`}>
                                <img src={item.src} alt="" className="size-full object-cover" loading={index > 3 ? 'lazy' : 'eager'} />
                            </div>
                        ))}
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

export function ShuffleHero({ providers = [], className }) {
    return (
        <section className={cn('bg-[#f4efe9] text-[#34231c]', className)}>
            <div className="page-container grid grid-cols-1 items-center gap-5 pb-7 pt-7 md:min-h-[520px] md:grid-cols-[.94fr_1.06fr] md:gap-8 md:pb-10 md:pt-20 lg:gap-12 lg:pb-14 lg:pt-24">
                <div>
                    <p className="text-center text-[10px] font-black uppercase tracking-[.18em] text-[#7d2e3c] md:hidden">The home for beauty professionals</p>
                    <h1 className="mt-2 max-w-[620px] text-center font-display text-[2.55rem] font-normal leading-[.94] text-[#34231c] md:mt-0 md:text-left md:text-[clamp(2.75rem,6.5vw,5.2rem)]">
                        The Beauty Service Ecosystem
                    </h1>
                    <p className="mt-3 text-center font-display text-xl font-normal text-[#4b3328] md:text-left sm:text-3xl">
                        Connect. Discover. Grow.
                    </p>
                    <p className="mx-auto mt-3 max-w-xl text-center text-sm font-normal leading-6 text-[#5a4d46] md:mx-0 md:text-left md:text-lg md:leading-7">
                        Discover trusted beauty professionals, stay updated on industry news and events, and connect with opportunities across the beauty industry.
                    </p>
                    <div className="mt-5 grid grid-cols-[1fr_auto] gap-3 md:hidden">
                        <Link to="/directory" className="flex min-h-12 items-center gap-3 rounded-xl border border-[#d8cabe] bg-white/60 px-4 text-sm font-semibold text-[#6f625b]">
                            <Icon name="search" size={22} /> Search BPHQ...
                        </Link>
                        <Link to="/register" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[#26211e] px-5 text-sm font-black uppercase tracking-wide text-white">
                            Join BPHQ
                        </Link>
                    </div>
                    <div className="mt-6 hidden flex-wrap gap-3 md:flex">
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
                </div>
                <div className="mx-auto w-full md:max-w-none"><HeroImageMarquee providers={providers} /></div>
                <div className="grid w-full overflow-hidden rounded-xl border border-[#ded2c7] bg-[#fbf7f1]/78 shadow-[0_16px_45px_rgba(64,42,32,.06)] backdrop-blur grid-cols-2 sm:grid-cols-4 md:col-span-2">
                    {[
                        ['users', '500+', 'Beauty Professionals'],
                        ['map', '50+', 'Cities'],
                        ['heart', '100+', 'Resources'],
                        ['calendar', '25+', 'Industry Events'],
                    ].map(([icon, value, label]) => (
                        <div key={label} className="flex items-center gap-3 border-[#ded2c7] px-4 py-4 odd:border-r sm:border-r sm:last:border-r-0 lg:px-6">
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#9b8f87] ring-1 ring-[#ded2c7]">
                                <Icon name={icon} size={19} strokeWidth={1.45} />
                            </span>
                            <div>
                                <p className="font-display text-xl font-semibold leading-none text-[#34231c]">{value}</p>
                                <p className="mt-1 max-w-24 text-[10px] font-bold leading-tight text-[#6f625b]">{label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
