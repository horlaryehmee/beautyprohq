import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, Button, Card, EmptyState, ErrorState, Field, LoadingBlock, PageHeader, SearchInput, StatusBadge, apiErrorMessage, apiRequest, inputClass, useApiResource, useAsyncAction, useDashboardToast, useDebouncedValue } from '../../components/dashboard';
import VerifiedBadge from '../../components/ui/VerifiedBadge';

const normalize = (value) => Array.isArray(value) ? value : value?.providers ?? value?.data ?? [];

export default function AdminDirectoryPage() {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState({ provider_category_id: '', profession: '', location: '', bio: '', profile_cta_label: '', profile_cta_url: '', is_listed: true, verified: false, is_pro_of_week: false });
    const [categoryForm, setCategoryForm] = useState({ id: null, name: '', description: '', sort_order: 0, is_active: true });
    const [saving, setSaving] = useState(false);
    const [categorySaving, setCategorySaving] = useState(false);
    const search = useDebouncedValue(query);
    const resource = useApiResource('/admin/directory', [], { params: { search: search || undefined, is_listed: filter === 'all' ? undefined : filter === 'listed' ? 1 : 0, category_id: categoryFilter || undefined } });
    const categoriesResource = useApiResource('/admin/provider-categories', []);
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();

    const providers = useMemo(() => normalize(resource.data), [resource.data]);
    const categories = useMemo(() => normalize(categoriesResource.data), [categoriesResource.data]);

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

    const startEdit = (provider) => {
        setEditing(provider);
        setForm({
            provider_category_id: provider.provider_category_id ?? provider.category?.id ?? '',
            profession: provider.profession ?? '',
            location: provider.location ?? '',
            bio: provider.bio ?? '',
            profile_cta_label: provider.profile_cta_label ?? '',
            profile_cta_url: provider.profile_cta_url ?? '',
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
            <Card>
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
            </Card>
            <Card>
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
                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {providers.map((provider) => {
                            const user = provider.user ?? provider;
                            const listed = provider.is_listed ?? provider.listed ?? true;
                            return (
                                <article className="rounded-2xl border border-slate-100 p-4" key={provider.id}>
                                    <div className="flex items-center gap-3">
                                        <Avatar name={user.name} size="lg" src={provider.profile_photo} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate font-bold text-slate-950">{user.name}</p>
                                                <VerifiedBadge show={Boolean(provider.verified)} />
                                            </div>
                                            <p className="truncate text-sm text-slate-500">{provider.profession}</p>
                                            <p className="mt-1 truncate text-xs text-slate-400">{provider.category?.name ?? 'No category'} · {provider.location}</p>
                                        </div>
                                        <StatusBadge status={listed ? 'active' : 'suspended'} />
                                    </div>
                                    <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                                        <span>{provider.verified ? 'Verified' : 'Not verified'}</span>
                                        <span>Rating {Number(provider.rating ?? 0).toFixed(1)}</span>
                                    </div>
                                    <div className="mt-4 grid grid-cols-3 gap-2">
                                        <Button busy={isBusy(provider.id)} onClick={() => toggle(provider)} type="button" variant={listed ? 'danger' : 'soft'}>
                                            {listed ? 'Remove' : 'List'}
                                        </Button>
                                        <Button onClick={() => startEdit(provider)} type="button" variant="secondary">Edit</Button>
                                        <Link to={`/admin/users/${user.id ?? provider.user_id}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                                            Manage
                                        </Link>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState description="No provider profiles match your filters." icon="profile" title="No listings found" />
                )}
            </Card>

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
                            <Field label="Profile button text"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, profile_cta_label: event.target.value }))} placeholder="Digital product" value={form.profile_cta_label} /></Field>
                            <Field label="Profile button URL"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, profile_cta_url: event.target.value }))} placeholder="https://..." value={form.profile_cta_url} /></Field>
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
