import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { collectionFrom } from '../../lib/api';
import Button from '../../components/ui/Button';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import Icon from '../../components/ui/Icon';
import Seo from '../../components/Seo';
import { shortDate } from '../../lib/utils';

const typeLabels = {
    job: 'Job',
    partnership: 'Partnership',
    vendor_call: 'Vendor call',
    training: 'Training',
    media: 'Media feature',
    speaking: 'Speaking',
};

const typeIcons = {
    job: 'briefcase',
    partnership: 'users',
    vendor_call: 'briefcase',
    training: 'calendar',
    media: 'external',
    speaking: 'user',
};

function labelFor(type) {
    if (!type) return 'Opportunity';
    return typeLabels[type] ?? String(type).replaceAll('_', ' ');
}

function daysUntil(value) {
    if (!value) return null;
    const today = new Date();
    const deadline = new Date(value);
    if (Number.isNaN(deadline.getTime())) return null;
    today.setHours(0, 0, 0, 0);
    deadline.setHours(0, 0, 0, 0);
    return Math.ceil((deadline - today) / 86400000);
}

function plainText(value) {
    return String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function contactInfo(value) {
    return typeof value === 'object' && value ? value : {};
}

function OpportunityCard({ item, index }) {
    const remaining = daysUntil(item.deadline);
    const urgent = remaining != null && remaining <= 7;
    const cardDescription = item.short_description || contactInfo(item.contact_info).short_description || plainText(item.description);

    return (
        <article className="group grid gap-5 rounded-[1.7rem] border border-[#ded2c7] bg-white p-5 shadow-[0_16px_45px_rgba(52,35,28,.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_70px_rgba(52,35,28,.11)] lg:grid-cols-[86px_1fr_auto] lg:items-center">
            <div className="flex items-center gap-4 lg:block">
                <span className="grid size-16 place-items-center rounded-2xl bg-[#f4efe9] font-display text-2xl font-normal text-[#7d2e3c]">{String(index + 1).padStart(2, '0')}</span>
                <span className="rounded-full bg-[#f4efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#8b4b59] lg:hidden">{labelFor(item.type)}</span>
            </div>
            <div className="min-w-0">
                <div className="hidden flex-wrap items-center gap-3 lg:flex">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f4efe9] px-3 py-1 text-[10px] font-black uppercase tracking-wide text-[#8b4b59]">
                        <Icon name={typeIcons[item.type] ?? 'external'} size={13} /> {labelFor(item.type)}
                    </span>
                    {item.location && <span className="inline-flex items-center gap-1 text-xs font-bold text-stone-500"><Icon name="map" size={13} />{item.location}</span>}
                    {item.deadline && <span className={`text-xs font-black ${urgent ? 'text-[#c92f64]' : 'text-stone-400'}`}>Closes {shortDate(item.deadline)}</span>}
                </div>
                <h2 className="mt-2 font-display text-2xl font-normal leading-tight text-[#34231c] sm:text-3xl">{item.title ?? labelFor(item.type)}</h2>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#6f625b]">{cardDescription}</p>
            </div>
            <Link to={`/opportunities/${item.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#34231c] px-6 text-sm font-black text-white transition hover:bg-[#4a2f26] lg:justify-self-end">
                View Details <Icon name="arrow" size={15} />
            </Link>
        </article>
    );
}

function TypeTile({ type, active, onClick }) {
    return (
        <button type="button" onClick={onClick} className={`group rounded-[1.5rem] border p-5 text-left transition duration-300 ${active ? 'border-[#34231c] bg-[#34231c] text-white shadow-[0_22px_60px_rgba(52,35,28,.18)]' : 'border-[#ded2c7] bg-white/80 text-[#34231c] hover:-translate-y-1 hover:bg-white hover:shadow-[0_18px_45px_rgba(52,35,28,.08)]'}`}>
            <span className={`grid size-11 place-items-center rounded-2xl ${active ? 'bg-white text-[#34231c]' : 'bg-[#f4efe9] text-[#8b4b59]'}`}>
                <Icon name={typeIcons[type] ?? 'external'} size={18} />
            </span>
            <p className="mt-5 text-xs font-black uppercase tracking-wide">{labelFor(type)}</p>
            <p className={`mt-2 text-sm font-semibold ${active ? 'text-white/70' : 'text-[#6f625b]'}`}>View category</p>
        </button>
    );
}

export default function OpportunitiesPage() {
    const [items, setItems] = useState([]);
    const [activeType, setActiveType] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/opportunities', { params: { per_page: 48 } });
            setItems(collectionFrom(response));
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'Opportunities could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const types = useMemo(() => {
        const counts = items.reduce((carry, item) => {
            const type = item.type ?? 'opportunity';
            carry[type] = (carry[type] ?? 0) + 1;
            return carry;
        }, {});

        return Object.entries(counts).map(([type, count]) => ({ type, count }));
    }, [items]);

    const filtered = activeType === 'all' ? items : items.filter((item) => (item.type ?? 'opportunity') === activeType);
    function chooseType(type) {
        setActiveType(type);
        window.requestAnimationFrame(() => {
            document.querySelector('#opportunity-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    return (
        <>
            <Seo
                title="Opportunities"
                description="Browse approved beauty industry opportunities including brand collaborations, event opportunities, media features, partnerships, and speaking requests."
            />
            <section className="relative isolate overflow-hidden bg-[#f4efe9] py-16 sm:py-20">
                <div className="absolute -right-24 top-10 -z-10 size-80 rounded-full bg-white/70 blur-3xl" />
                <div className="absolute bottom-0 left-0 -z-10 h-44 w-full bg-gradient-to-t from-white/55 to-transparent" />
                <div className="page-container">
                    <div>
                        <h1 className="max-w-5xl font-display text-5xl font-normal leading-[.94] text-[#34231c] sm:text-7xl">Find collaborations, features, and industry doors worth opening.</h1>
                        <p className="mt-6 max-w-2xl text-base leading-8 text-[#6f625b]">Browse approved opportunities submitted through BPHQ, from brand collaborations to speaking slots and media requests.</p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Button onClick={() => chooseType('all')} className="rounded-full bg-[#34231c] px-7 hover:bg-[#4a2f26]">
                                Browse opportunities <Icon name="arrow" size={15} />
                            </Button>
                            <Link to="/opportunities#opportunity-list" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#c9bdb2] bg-white/75 px-6 text-sm font-bold text-[#34231c] transition hover:bg-white">
                                View open calls <Icon name="briefcase" size={15} />
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <section id="opportunity-list" className="bg-white py-12 sm:py-16">
                <div className="page-container">
                    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.18em] text-[#8b4b59]">Browse by type</p>
                            <h2 className="mt-2 font-display text-4xl font-normal text-[#34231c]">Choose the right fit.</h2>
                        </div>
                        <Button variant="secondary" onClick={load} disabled={loading}>
                            Refresh <Icon name="refresh" size={15} />
                        </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <TypeTile type="all" active={activeType === 'all'} onClick={() => setActiveType('all')} />
                        {types.map(({ type }) => <TypeTile key={type} type={type} active={activeType === type} onClick={() => setActiveType(type)} />)}
                    </div>

                    {error && <InlineAlert className="mt-6">{error} <button type="button" onClick={load} className="ml-1 underline">Try again</button></InlineAlert>}

                    <div className="mt-9">
                        {loading ? (
                            <div className="grid gap-4">
                                {Array.from({ length: 4 }).map((_, index) => <div key={index} className="rounded-[1.7rem] border border-stone-200 bg-white p-5"><div className="skeleton h-14 w-14 rounded-2xl" /><div className="mt-4 space-y-3"><div className="skeleton h-4 w-32 rounded" /><div className="skeleton h-8 w-3/4 rounded" /><div className="skeleton h-4 w-full rounded" /></div></div>)}
                            </div>
                        ) : filtered.length ? (
                            <div className="grid gap-4">
                                {filtered.map((item, index) => <OpportunityCard key={item.id} item={item} index={index} />)}
                            </div>
                        ) : !error && (
                            <EmptyState icon="briefcase" title="No opportunities in this category" message="Try another type or check back when new approved opportunities are published." />
                        )}
                    </div>
                </div>
            </section>

            <section className="bg-[#f4efe9] py-14">
                <div className="page-container">
                    <div className="rounded-[2rem] bg-[#34231c] p-7 text-white shadow-[0_26px_80px_rgba(52,35,28,.18)] sm:p-10 lg:flex lg:items-center lg:justify-between lg:gap-8">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[.2em] text-rose-200">Submit an opportunity</p>
                            <h2 className="mt-3 font-display text-4xl font-normal leading-tight">Have an opportunity for beauty professionals?</h2>
                            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">Brand collaborations, speaking slots, media features, and partnership requests can be reviewed and surfaced through BPHQ.</p>
                        </div>
                        <Link to="/opportunities#opportunity-list" className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-xs font-black uppercase tracking-wide text-[#34231c] lg:mt-0">
                            Browse open calls <Icon name="briefcase" size={16} />
                        </Link>
                    </div>
                </div>
            </section>
        </>
    );
}
