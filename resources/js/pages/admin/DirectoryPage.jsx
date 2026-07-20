import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, Pagination, SearchInput, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useAsyncAction, useDashboardToast, useDebouncedValue } from '../../components/dashboard';
import VerifiedBadge from '../../components/ui/VerifiedBadge';

const normalize = (value) => Array.isArray(value) ? value : value?.providers ?? value?.data ?? [];
const metaFrom = (value) => value?.meta ?? {};

export default function AdminDirectoryPage() {
    const [activeTab, setActiveTab] = useState('list');
    const [query, setQuery] = useState('');
    const [proOfWeekQuery, setProOfWeekQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ provider_category_id: '', profession: '', location: '', bio: '', is_listed: true, verified: false, is_pro_of_week: false });
    const [categoryForm, setCategoryForm] = useState({ id: null, name: '', description: '', sort_order: 0, is_active: true });
    const [saving, setSaving] = useState(false);
    const [categorySaving, setCategorySaving] = useState(false);
    const search = useDebouncedValue(query);
    const proOfWeekSearch = useDebouncedValue(proOfWeekQuery);
    const resource = useApiResource('/admin/directory', [], { params: { page, per_page: 12, search: search || undefined, is_listed: filter === 'all' ? undefined : filter === 'listed' ? 1 : 0, category_id: categoryFilter || undefined } });
    const proOfWeekResource = useApiResource('/admin/directory', [], { params: { search: proOfWeekSearch || undefined, is_listed: 1, per_page: 8 } });
    const categoriesResource = useApiResource('/admin/provider-categories', []);
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();

    const providers = useMemo(() => normalize(resource.data), [resource.data]);
    const meta = metaFrom(resource.data);
    const pageCount = Number(meta.last_page ?? meta.lastPage ?? 1);
    const currentPage = Number(meta.current_page ?? meta.currentPage ?? page);
    const proOfWeekProviders = useMemo(() => normalize(proOfWeekResource.data), [proOfWeekResource.data]);
    const categories = useMemo(() => normalize(categoriesResource.data), [categoriesResource.data]);
    const currentProOfWeek = useMemo(() => proOfWeekProviders.find((provider) => provider.is_pro_of_week) ?? providers.find((provider) => provider.is_pro_of_week), [proOfWeekProviders, providers]);

    useEffect(() => {
        setPage(1);
    }, [search, filter, categoryFilter]);

    const toggle = (provider) => run(provider.id, async () => {
        const current = provider.is_listed ?? provider.listed ?? true;
        try {
            await apiRequest('patch', `/admin/providers/${provider.id}`, { is_listed: !current });
            resource.reload(true);
            notify(!current ? 'Provider added to directory.' : 'Provider removed from directory.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    const selectProOfWeek = (provider) => run(`pro-week-${provider.id}`, async () => {
        try {
            await apiRequest('patch', `/admin/providers/${provider.id}`, { is_pro_of_week: true });
            resource.reload(true);
            proOfWeekResource.reload(true);
            notify(`${provider.user?.name ?? provider.name ?? 'Provider'} is now Pro of the week.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    const startEdit = (provider) => {
        setEditing(provider);
        setForm({
            provider_category_id: provider.provider_category_id ?? provider.category?.id ?? '',
            profession: provider.profession ?? '',
            location: provider.location ?? '',
            bio: provider.bio ?? '',
            is_listed: Boolean(provider.is_listed ?? provider.listed ?? true),
            verified: Boolean(provider.verified),
            is_pro_of_week: Boolean(provider.is_pro_of_week),
        });
    };

    const resetCategoryForm = () => setCategoryForm({ id: null, name: '', description: '', sort_order: 0, is_active: true });

    const saveCategory = async (event) => {
        event.preventDefault();
        setCategorySaving(true);
        try {
            const payload = {
                name: categoryForm.name,
                description: categoryForm.description || null,
                sort_order: Number(categoryForm.sort_order || 0),
                is_active: Boolean(categoryForm.is_active),
            };
            if (categoryForm.id) {
                await apiRequest('patch', `/admin/provider-categories/${categoryForm.id}`, payload);
                notify('Category updated.');
            } else {
                await apiRequest('post', '/admin/provider-categories', payload);
                notify('Category created.');
            }
            resetCategoryForm();
            categoriesResource.reload(true);
            resource.reload(true);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setCategorySaving(false);
        }
    };

    const editCategory = (category) => setCategoryForm({
        id: category.id,
        name: category.name ?? '',
        description: category.description ?? '',
        sort_order: category.sort_order ?? 0,
        is_active: Boolean(category.is_active),
    });

    const deleteCategory = (category) => run(`category-${category.id}`, async () => {
        try {
            await apiRequest('delete', `/admin/provider-categories/${category.id}`);
            notify('Category deleted.');
            categoriesResource.reload(true);
            resource.reload(true);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    const saveListing = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await apiRequest('patch', `/admin/providers/${editing.id}`, { ...form, provider_category_id: form.provider_category_id || null });
            resource.reload(true);
            categoriesResource.reload(true);
            setEditing(null);
            notify('Listing updated.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader description="Approve listings, manage provider categories, and track the total providers in each category." eyebrow="Marketplace" title="Directory listings" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            {categoriesResource.error && <ErrorState message={categoriesResource.error} onRetry={categoriesResource.reload} />}
            <Card className="p-2">
                <div className="flex gap-2 overflow-x-auto">
                    {[
                        ['list', 'Directory list'],
                        ['categories', 'Provider categories'],
                        ['pro_of_week', 'Pro of the week'],
                    ].map(([key, label]) => (
                        <button
                            className={`whitespace-nowrap rounded-2xl px-4 py-2 text-sm font-black transition ${activeTab === key ? 'bg-slate-950 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-950'}`}
                            key={key}
                            onClick={() => setActiveTab(key)}
                            type="button"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </Card>
            {activeTab === 'categories' && <Card>
                <div className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
                    <div>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black text-slate-950">Provider categories</h2>
                                <p className="mt-1 text-sm text-slate-500">These are the categories providers can select for their public profile.</p>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {categories.map((category) => (
                                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3" key={category.id}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-black text-slate-950">{category.name}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-400">{Number(category.providers_count ?? 0).toLocaleString()} provider{Number(category.providers_count ?? 0) === 1 ? '' : 's'}</p>
                                        </div>
                                        <StatusBadge status={category.is_active ? 'active' : 'inactive'} />
                                    </div>
                                    <div className="mt-3 flex gap-2">
                                        <Button onClick={() => editCategory(category)} type="button" variant="secondary">Edit</Button>
                                        <Button busy={isBusy(`category-${category.id}`)} onClick={() => deleteCategory(category)} type="button" variant="danger">Delete</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <form className="rounded-2xl border border-slate-100 bg-white p-4" onSubmit={saveCategory}>
                        <h3 className="text-sm font-black text-slate-950">{categoryForm.id ? 'Edit category' : 'Add category'}</h3>
                        <div className="mt-4 grid gap-3">
                            <Field label="Category name"><input className={inputClass} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder="Makeup Artist" required value={categoryForm.name} /></Field>
                            <Field label="Description"><textarea className={`${inputClass} min-h-20`} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} value={categoryForm.description} /></Field>
                            <div className="grid grid-cols-[1fr_auto] gap-3">
                                <Field label="Order"><input className={inputClass} min="0" onChange={(event) => setCategoryForm((current) => ({ ...current, sort_order: event.target.value }))} type="number" value={categoryForm.sort_order} /></Field>
                                <label className="mt-6 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700">
                                    <input checked={Boolean(categoryForm.is_active)} className="size-4 accent-fuchsia-700" onChange={(event) => setCategoryForm((current) => ({ ...current, is_active: event.target.checked }))} type="checkbox" />
                                    Active
                                </label>
                            </div>
                            <div className="flex justify-end gap-2">
                                {categoryForm.id && <Button onClick={resetCategoryForm} type="button" variant="secondary">Cancel</Button>}
                                <Button busy={categorySaving} type="submit">{categoryForm.id ? 'Save category' : 'Create category'}</Button>
                            </div>
                        </div>
                    </form>
                </div>
            </Card>}
            {activeTab === 'pro_of_week' && <Card>
                <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                    <div>
                        <h2 className="text-lg font-black text-slate-950">Pro of the week</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-500">Search listed providers and choose who appears in the homepage feature card.</p>
                        {currentProOfWeek && (
                            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3">
                                <Avatar name={currentProOfWeek.user?.name} size="lg" src={currentProOfWeek.profile_photo} />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-slate-950">{currentProOfWeek.user?.name}</p>
                                    <p className="truncate text-xs font-semibold text-slate-500">{currentProOfWeek.profession} · {currentProOfWeek.location}</p>
                                </div>
                                <StatusBadge status="featured" />
                            </div>
                        )}
                    </div>
                    <div>
                        <SearchInput onChange={(event) => setProOfWeekQuery(event.target.value)} placeholder="Search provider users" value={proOfWeekQuery} />
                        <div className="mt-3 grid gap-2">
                            {proOfWeekResource.loading ? <LoadingBlock rows={3} /> : proOfWeekProviders.length ? proOfWeekProviders.map((provider) => {
                                const user = provider.user ?? provider;
                                const selected = Boolean(provider.is_pro_of_week);
                                return (
                                    <button className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'}`} key={provider.id} onClick={() => selectProOfWeek(provider)} type="button">
                                        <Avatar name={user.name} size="md" src={provider.profile_photo} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-black text-slate-950">{user.name}</p>
                                            <p className="truncate text-xs font-semibold text-slate-500">{provider.profession} · {provider.location}</p>
                                        </div>
                                        {selected ? <StatusBadge status="featured" /> : <span className="text-xs font-black uppercase tracking-wide text-fuchsia-700">Select</span>}
                                    </button>
                                );
                            }) : <EmptyState description="Try another provider name, profession, or location." icon="search" title="No providers found" />}
                        </div>
                    </div>
                </div>
            </Card>}
            {activeTab === 'list' && <Card>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                    <SearchInput onChange={(event) => setQuery(event.target.value)} placeholder="Search provider, profession or location" value={query} />
                    <select className={inputClass} onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
                        <option value="">All categories</option>
                        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                    <select className={inputClass} onChange={(event) => setFilter(event.target.value)} value={filter}>
                        <option value="all">All profiles</option>
                        <option value="listed">Listed</option>
                        <option value="unlisted">Removed</option>
                    </select>
                </div>

                {resource.loading ? (
                    <div className="mt-5"><LoadingBlock rows={5} /></div>
                ) : providers.length ? (
                    <>
                        <div className="mt-5 overflow-x-auto">
                            <table className="w-full min-w-[980px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                                        <th className="pb-3 font-bold">Provider</th>
                                        <th className="pb-3 font-bold">Category</th>
                                        <th className="pb-3 font-bold">Location</th>
                                        <th className="pb-3 font-bold">Rating</th>
                                        <th className="pb-3 font-bold">Status</th>
                                        <th className="pb-3 text-right font-bold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {providers.map((provider) => {
                                        const user = provider.user ?? provider;
                                        const listed = provider.is_listed ?? provider.listed ?? true;
                                        return (
                                            <tr className="border-b border-slate-50 last:border-0" key={provider.id}>
                                                <td className="py-3">
                                                    <div className="flex items-center gap-3">
                                                        <Avatar name={user.name} size="sm" src={provider.profile_photo} />
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5">
                                                                <p className="truncate font-bold text-slate-950">{user.name}</p>
                                                                <VerifiedBadge show={Boolean(provider.verified)} size="sm" />
                                                            </div>
                                                            <p className="truncate text-xs text-slate-400">{user.email}</p>
                                                            <p className="truncate text-xs font-semibold text-slate-500">{provider.profession}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 text-slate-600">{provider.category?.name ?? 'No category'}</td>
                                                <td className="py-3 text-slate-600">{provider.location ?? 'No location'}</td>
                                                <td className="py-3 text-slate-600">{Number(provider.rating ?? 0).toFixed(1)}</td>
                                                <td className="py-3"><div className="flex flex-wrap gap-2"><StatusBadge status={listed ? 'active' : 'suspended'} /><StatusBadge status={provider.verified ? 'verified' : 'pending'} /></div></td>
                                                <td className="py-3"><div className="flex justify-end gap-2"><Button busy={isBusy(provider.id)} onClick={() => toggle(provider)} type="button" variant={listed ? 'danger' : 'soft'}>{listed ? 'Remove' : 'List'}</Button><Button onClick={() => startEdit(provider)} type="button" variant="secondary">Edit</Button><Link to={`/admin/users/${user.id ?? provider.user_id}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">Manage</Link></div></td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
                    </>
                ) : (
                    <EmptyState description="No provider profiles match your filters." icon="profile" title="No listings found" />
                )}
            </Card>}

            {editing && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setEditing(null)}>
                    <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-black text-slate-950">Edit listing</h2>
                        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={saveListing}>
                            <Field className="sm:col-span-2" label="Provider category">
                                <select className={inputClass} onChange={(event) => setForm((current) => ({ ...current, provider_category_id: event.target.value }))} value={form.provider_category_id}>
                                    <option value="">No category selected</option>
                                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                                </select>
                            </Field>
                            <Field label="Profession"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, profession: event.target.value }))} value={form.profession} /></Field>
                            <Field label="Location"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} value={form.location} /></Field>
                            <Field className="sm:col-span-2" label="Bio"><textarea className={`${inputClass} min-h-28`} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} value={form.bio} /></Field>
                            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                                {[
                                    ['is_listed', 'Listed in directory'],
                                    ['verified', 'BPHQ verified'],
                                    ['is_pro_of_week', 'Pro of the week'],
                                ].map(([key, label]) => (
                                    <label className="flex items-center justify-between rounded-2xl border border-slate-100 p-4 text-sm font-bold text-slate-700" key={key}>
                                        {label}
                                        <input checked={Boolean(form[key])} className="size-5 accent-fuchsia-700" onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} type="checkbox" />
                                    </label>
                                ))}
                            </div>
                            <div className="flex justify-end gap-2 sm:col-span-2">
                                <Button onClick={() => setEditing(null)} type="button" variant="secondary">Cancel</Button>
                                <Button busy={saving} type="submit">Save listing</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
