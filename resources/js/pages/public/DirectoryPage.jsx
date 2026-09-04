import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { collectionFrom, metaFrom } from '../../lib/api';
import Button from '../../components/ui/Button';
import { EmptyState, InlineAlert } from '../../components/ui/Feedback';
import FormField from '../../components/ui/FormField';
import Icon from '../../components/ui/Icon';
import ProviderCard from '../../components/public/ProviderCard';
import Seo from '../../components/Seo';

const categoryOptions = [
    { value: 'Hair', label: 'Hair & styling' },
    { value: 'Makeup', label: 'Makeup' },
    { value: 'Nails', label: 'Nails' },
    { value: 'Barbering', label: 'Barbering' },
    { value: 'Skincare', label: 'Skincare & esthetics' },
    { value: 'Lashes', label: 'Lashes & brows' },
    { value: 'Massage', label: 'Massage & wellness' },
    { value: 'Education', label: 'Beauty education' },
    { value: 'Consultation', label: 'Consultations' },
];

function paramsToForm(params) {
    return {
        search: params.get('search') ?? '',
        location: params.get('location') ?? '',
        category: params.get('category') ?? '',
        verified: params.get('verified') ?? '',
        rating: params.get('rating') ?? '',
        service_type: params.get('service_type') ?? '',
    };
}

export default function DirectoryPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [form, setForm] = useState(() => paramsToForm(searchParams));
    const [providers, setProviders] = useState([]);
    const [meta, setMeta] = useState({});
    const [filters, setFilters] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filterOpen, setFilterOpen] = useState(false);
    const [shuffleSeed] = useState(() => Math.floor(Math.random() * 2147483646) + 1);
    const query = searchParams.toString();

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await api.get('/providers', { params: { ...Object.fromEntries(searchParams.entries()), shuffle_seed: shuffleSeed } });
            setProviders(collectionFrom(response));
            setMeta(metaFrom(response));
            setFilters(response?.data?.filters ?? response?.data?.meta?.filters ?? {});
        } catch (requestError) {
            setError(requestError?.response?.data?.message || 'The directory could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [query, shuffleSeed]);

    useEffect(() => {
        setForm(paramsToForm(searchParams));
        load();
    }, [query, load]);

    const activeCount = useMemo(() => Object.values(form).filter(Boolean).length, [form]);
    const categories = filters.categories?.length ? filters.categories : categoryOptions;
    const serviceTypes = filters.service_types?.length ? filters.service_types : ['in_person', 'mobile', 'virtual'];
    const locations = filters.locations ?? [];
    const currentPage = Number(meta.current_page ?? meta.page ?? 1);
    const lastPage = Number(meta.last_page ?? meta.total_pages ?? 1);
    const total = Number(meta.total ?? providers.length);
    const pageNumbers = useMemo(() => {
        if (lastPage <= 1) return [];
        const start = Math.max(1, currentPage - 1);
        const end = Math.min(lastPage, start + 2);
        const adjustedStart = Math.max(1, end - 2);
        return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
    }, [currentPage, lastPage]);

    function update(key, value) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function applyFilters(event) {
        event.preventDefault();
        const next = Object.fromEntries(Object.entries(form).filter(([, value]) => value !== '' && value != null));
        setSearchParams(next);
        setFilterOpen(false);
    }

    function clearFilters() {
        setForm(paramsToForm(new URLSearchParams()));
        setSearchParams({});
    }

    function selectCategory(value) {
        const nextForm = { ...form, category: value };
        setForm(nextForm);
        const next = Object.fromEntries(Object.entries(nextForm).filter(([, fieldValue]) => fieldValue !== '' && fieldValue != null));
        setSearchParams(next);
    }

    function goToPage(page) {
        const next = new URLSearchParams(searchParams);
        next.set('page', page);
        setSearchParams(next);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return (
        <>
            <Seo
                title="Verified Beauty Professional Directory"
                description="Search and discover trusted beauty professionals by name, service, location, category, rating, and verification status."
            />
            <section className="page-container overflow-hidden py-5 sm:py-8">
                <div className="grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)] lg:items-start">
                    <aside className="hidden lg:block lg:self-start">
                        <form onSubmit={applyFilters} className="sticky top-[88px] rounded-3xl border border-stone-200 bg-white p-4 shadow-[0_14px_40px_rgba(70,28,54,.06)] sm:p-5">
                            <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-rose-600">Filter</p>
                                    {!loading && <p className="mt-1 text-xs font-bold text-stone-500">{total.toLocaleString()} professional{total === 1 ? '' : 's'} found</p>}
                                </div>
                                {activeCount > 0 && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 hover:text-rose-900"><Icon name="x" size={14} /> Clear</button>}
                            </div>

                            <div className="mt-4 grid gap-3">
                                <FormField label="Name or service" icon="search" placeholder="Search professionals or services" value={form.search} onChange={(event) => update('search', event.target.value)} />
                                <div><FormField label="Location" icon="map" list="directory-locations" placeholder="City or neighbourhood" value={form.location} onChange={(event) => update('location', event.target.value)} /><datalist id="directory-locations">{locations.map((location) => <option key={location} value={location} />)}</datalist></div>
                                <FormField as="select" label="Category" value={form.category} onChange={(event) => update('category', event.target.value)}>
                                    <option value="">All categories</option>
                                    {categories.map((category) => {
                                        const value = typeof category === 'string' ? category : category.value ?? category.name;
                                        const label = typeof category === 'string' ? category : category.label ?? category.name;
                                        return <option key={value} value={value}>{label}</option>;
                                    })}
                                </FormField>
                                <FormField as="select" label="Verification" value={form.verified} onChange={(event) => update('verified', event.target.value)}>
                                    <option value="">All profiles</option><option value="1">Verified only</option><option value="0">Not yet verified</option>
                                </FormField>
                                <FormField as="select" label="Minimum rating" value={form.rating} onChange={(event) => update('rating', event.target.value)}>
                                    <option value="">Any rating</option><option value="4">4.0 and above</option><option value="4.5">4.5 and above</option><option value="5">5.0 only</option>
                                </FormField>
                                <FormField as="select" label="Service type" value={form.service_type} onChange={(event) => update('service_type', event.target.value)}>
                                    <option value="">All service types</option>{serviceTypes.map((type) => { const value = typeof type === 'string' ? type : type.value; const label = typeof type === 'string' ? type.replaceAll('_', ' ') : type.label; return <option key={value} value={value}>{label}</option>; })}
                                </FormField>
                                <Button type="submit" className="w-full">Apply filters <Icon name="arrow" size={16} /></Button>
                            </div>
                        </form>
                    </aside>

                    <div className="min-w-0">
                        <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-stone-500">Directory</p>
                                {!loading && <p className="mt-0.5 text-sm font-bold text-[#2A1D14]">{total.toLocaleString()} provider{total === 1 ? '' : 's'}</p>}
                            </div>
                            <button type="button" onClick={() => setFilterOpen(true)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#2A1D14] px-4 text-xs font-semibold uppercase tracking-wide text-white shadow-sm">
                                <Icon name="menu" size={16} /> Filter{activeCount ? ` (${activeCount})` : ''}
                            </button>
                        </div>

                        <div className="mb-4 w-full overflow-hidden lg:hidden">
                            <div className="flex w-full gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                <button type="button" onClick={() => selectCategory('')} className={`min-h-10 shrink-0 rounded-lg px-4 text-[11px] font-semibold uppercase tracking-wide transition ${!form.category ? 'bg-[#2A1D14] text-white' : 'bg-[#F7F3ED] text-[#2A1D14]'}`}>
                                    All Categories
                                </button>
                                {categories.map((category) => {
                                    const value = typeof category === 'string' ? category : category.value ?? category.name;
                                    const label = typeof category === 'string' ? category : category.label ?? category.name;
                                    return (
                                        <button key={value} type="button" onClick={() => selectCategory(value)} className={`min-h-10 shrink-0 rounded-lg px-4 text-[11px] font-semibold uppercase tracking-wide transition ${form.category === value ? 'bg-[#2A1D14] text-white' : 'bg-[#F7F3ED] text-[#2A1D14]'}`}>
                                            {label}
                                        </button>
                                    );
                                })}
                                <button type="button" onClick={() => setFilterOpen(true)} className="grid min-h-10 min-w-12 shrink-0 place-items-center rounded-lg bg-[#F7F3ED] text-[#2A1D14]" aria-label="More filters">
                                    <Icon name="menu" size={16} />
                                </button>
                            </div>
                        </div>

                        {error && <InlineAlert>{error} <button type="button" onClick={load} className="ml-1 underline">Try again</button></InlineAlert>}

                        {loading ? (
                            <div className="grid gap-2.5 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="skeleton h-[148px] rounded-lg sm:h-auto sm:min-h-[330px]" />)}</div>
                        ) : providers.length ? (
                            <>
                                <div className="grid gap-2.5 sm:gap-5 sm:grid-cols-2 xl:grid-cols-3">{providers.map((provider) => <ProviderCard key={provider.id ?? provider.slug ?? provider.user_id} provider={provider} />)}</div>
                                {lastPage > 1 && (
                                    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Directory pages">
                                        <Button variant="secondary" size="icon" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)} aria-label="Previous page"><Icon name="chevronLeft" /></Button>
                                        {pageNumbers[0] > 1 && (
                                            <>
                                                <button type="button" onClick={() => goToPage(1)} className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-white text-sm font-semibold text-[#2A1D14]">1</button>
                                                {pageNumbers[0] > 2 && <span className="px-1 text-sm font-semibold text-stone-400">...</span>}
                                            </>
                                        )}
                                        {pageNumbers.map((page) => (
                                            <button key={page} type="button" onClick={() => goToPage(page)} aria-current={currentPage === page ? 'page' : undefined} className={`grid size-10 place-items-center rounded-xl text-sm font-semibold transition ${currentPage === page ? 'bg-[#2A1D14] text-white' : 'border border-stone-200 bg-white text-[#2A1D14] hover:bg-[#F7F3ED]'}`}>
                                                {page}
                                            </button>
                                        ))}
                                        {pageNumbers.at(-1) < lastPage && (
                                            <>
                                                {pageNumbers.at(-1) < lastPage - 1 && <span className="px-1 text-sm font-semibold text-stone-400">...</span>}
                                                <button type="button" onClick={() => goToPage(lastPage)} className="grid size-10 place-items-center rounded-xl border border-stone-200 bg-white text-sm font-semibold text-[#2A1D14]">{lastPage}</button>
                                            </>
                                        )}
                                        <Button variant="secondary" size="icon" disabled={currentPage >= lastPage} onClick={() => goToPage(currentPage + 1)} aria-label="Next page"><Icon name="chevronRight" /></Button>
                                    </nav>
                                )}
                            </>
                        ) : !error && <EmptyState icon="search" title="No professionals match those filters" message="Try a broader service, location, or rating to see more of the directory." action={<Button variant="secondary" onClick={clearFilters}>Reset filters</Button>} />}
                    </div>
                </div>
            </section>

            {filterOpen && (
                <div className="fixed inset-0 z-[80] bg-[#2A1D14]/40 backdrop-blur-sm lg:hidden" onMouseDown={() => setFilterOpen(false)}>
                    <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[1.6rem] bg-white p-4 shadow-[0_-18px_60px_rgba(36,23,17,.22)]" onMouseDown={(event) => event.stopPropagation()}>
                        <form onSubmit={applyFilters}>
                            <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-4">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[.16em] text-rose-600">Filter directory</p>
                                    {!loading && <p className="mt-1 text-xs font-bold text-stone-500">{total.toLocaleString()} professional{total === 1 ? '' : 's'} found</p>}
                                </div>
                                <button type="button" onClick={() => setFilterOpen(false)} className="grid size-10 place-items-center rounded-full bg-stone-100 text-[#2A1D14]" aria-label="Close filters">
                                    <Icon name="x" size={18} />
                                </button>
                            </div>

                            <div className="mt-4 grid gap-3">
                                <FormField label="Name or service" icon="search" placeholder="Search professionals or services" value={form.search} onChange={(event) => update('search', event.target.value)} />
                                <div><FormField label="Location" icon="map" list="directory-locations-mobile" placeholder="City or neighbourhood" value={form.location} onChange={(event) => update('location', event.target.value)} /><datalist id="directory-locations-mobile">{locations.map((location) => <option key={location} value={location} />)}</datalist></div>
                                <FormField as="select" label="Category" value={form.category} onChange={(event) => update('category', event.target.value)}>
                                    <option value="">All categories</option>
                                    {categories.map((category) => {
                                        const value = typeof category === 'string' ? category : category.value ?? category.name;
                                        const label = typeof category === 'string' ? category : category.label ?? category.name;
                                        return <option key={value} value={value}>{label}</option>;
                                    })}
                                </FormField>
                                <FormField as="select" label="Verification" value={form.verified} onChange={(event) => update('verified', event.target.value)}>
                                    <option value="">All profiles</option><option value="1">Verified only</option><option value="0">Not yet verified</option>
                                </FormField>
                                <FormField as="select" label="Minimum rating" value={form.rating} onChange={(event) => update('rating', event.target.value)}>
                                    <option value="">Any rating</option><option value="4">4.0 and above</option><option value="4.5">4.5 and above</option><option value="5">5.0 only</option>
                                </FormField>
                                <FormField as="select" label="Service type" value={form.service_type} onChange={(event) => update('service_type', event.target.value)}>
                                    <option value="">All service types</option>{serviceTypes.map((type) => { const value = typeof type === 'string' ? type : type.value; const label = typeof type === 'string' ? type.replaceAll('_', ' ') : type.label; return <option key={value} value={value}>{label}</option>; })}
                                </FormField>
                                <div className="sticky bottom-0 -mx-4 mt-2 flex gap-2 border-t border-stone-100 bg-white p-4">
                                    {activeCount > 0 && <button type="button" onClick={clearFilters} className="min-h-11 flex-1 rounded-xl border border-stone-200 text-xs font-semibold uppercase tracking-wide text-[#2A1D14]">Clear</button>}
                                    <Button type="submit" className="min-h-11 flex-[1.5]">Apply filters</Button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
