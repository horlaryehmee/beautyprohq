import { useState } from 'react';
import {
    Button,
    Card,
    Currency,
    EmptyState,
    ErrorState,
    Field,
    LoadingBlock,
    PageHeader,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';
import { mediaUrl } from '../../lib/utils';

const emptyProduct = { name: '', description: '', price: '', product_file: null, product_url: '', image_file: null, image_url: '', active: true };
const normalize = (value) => Array.isArray(value) ? value : value?.digital_products ?? value?.data ?? [];

export default function ProviderDigitalProductsPage() {
    const resource = useApiResource('/provider/digital-products', []);
    const [form, setForm] = useState(emptyProduct);
    const [editing, setEditing] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const products = normalize(resource.data);

    const openForm = (product = null) => {
        setEditing(product);
        setForm(product ? {
            name: product.name ?? product.title ?? '',
            description: product.description ?? '',
            price: product.price ?? '',
            product_file: null,
            product_url: product.product_url ?? product.url ?? '',
            image_file: null,
            image_url: product.image_url ?? product.image ?? '',
            active: product.active ?? product.is_active ?? true,
        } : emptyProduct);
        setShowForm(true);
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = new FormData();
            if (editing) payload.append('_method', 'PUT');
            payload.append('name', form.name);
            payload.append('description', form.description ?? '');
            payload.append('price', Number(form.price));
            payload.append('is_active', form.active ? '1' : '0');
            if (form.product_file instanceof File) payload.append('product_file', form.product_file);
            else if (form.product_url) payload.append('url', form.product_url);
            if (form.image_file instanceof File) payload.append('image_file', form.image_file);
            else if (form.image_url) payload.append('image', form.image_url);

            const saved = await apiRequest('post', editing ? `/provider/digital-products/${editing.id}` : '/provider/digital-products', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
            resource.setData((current) => editing
                ? normalize(current).map((item) => item.id === editing.id ? { ...item, ...saved } : item)
                : [...normalize(current), saved]);
            setShowForm(false);
            notify(editing ? 'Product updated.' : 'Product published.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (product) => {
        if (!window.confirm(`Delete ${product.name ?? product.title}?`)) return;
        try {
            await apiRequest('delete', `/provider/digital-products/${product.id}`);
            resource.setData((current) => normalize(current).filter((item) => item.id !== product.id));
            notify('Product deleted.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader actions={<Button onClick={() => openForm()} type="button">Add product</Button>} description="Sell guides, templates and other downloadable resources from your profile." eyebrow="Storefront" title="Digital products" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            <Card>
                {resource.loading ? <LoadingBlock rows={4} /> : products.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {products.map((product) => {
                            const image = mediaUrl(product.image_url ?? product.image);
                            const download = mediaUrl(product.product_url ?? product.url);
                            return (
                                <article className="overflow-hidden rounded-2xl border border-slate-100" key={product.id}>
                                    {image
                                        ? <img alt="" className="h-36 w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={image} />
                                        : (
                                            <div className="grid h-36 place-items-center bg-gradient-to-br from-fuchsia-50 to-rose-50">
                                                <img src="/brand/bphq-logo-transparent.svg" alt="" className="h-28 w-auto object-contain opacity-80" />
                                            </div>
                                        )}
                                    <div className="p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <h2 className="font-bold text-slate-950">{product.name ?? product.title}</h2>
                                            <StatusBadge status={(product.active ?? product.is_active) ? 'active' : 'draft'} />
                                        </div>
                                        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">{product.description}</p>
                                        <p className="mt-3 text-lg font-bold text-fuchsia-700"><Currency currency={product.currency ?? 'NGN'} value={product.price} /></p>
                                        <div className="mt-4 flex gap-2">
                                            {download && <a className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700" href={download} rel="noreferrer" target="_blank">Open file</a>}
                                            <Button className="flex-1" onClick={() => openForm(product)} type="button" variant="secondary">Edit</Button>
                                            <Button onClick={() => remove(product)} type="button" variant="danger">Delete</Button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState action={<Button onClick={() => openForm()} type="button">Create your first product</Button>} description="Products inherit the currency you selected when registering as a provider." icon="product" title="No digital products" />
                )}
            </Card>

            {showForm && (
                <div className="fixed inset-0 z-[70] grid place-items-end overflow-y-auto bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setShowForm(false)}>
                    <Card className="w-full max-w-xl rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-bold text-slate-950">{editing ? 'Edit product' : 'Add digital product'}</h2>
                        <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={save}>
                            <Field className="sm:col-span-2" label="Product name"><input className={inputClass} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required value={form.name} /></Field>
                            <Field className="sm:col-span-2" label="Description"><textarea className={`${inputClass} min-h-24`} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} value={form.description} /></Field>
                            <Field label="Price"><input className={inputClass} min="0" onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} required type="number" value={form.price} /></Field>
                            <Field className="sm:col-span-2" label="Product file" hint={editing && form.product_url ? 'Upload a new file only if you want to replace the current product file.' : 'Allowed: PDF, ZIP, images, Word, Excel, or PowerPoint files.'}>
                                {form.product_url && !(form.product_file instanceof File) && <a className="mb-3 block truncate rounded-xl bg-slate-50 p-3 text-sm font-semibold text-fuchsia-700" href={mediaUrl(form.product_url)} rel="noreferrer" target="_blank">Current product file</a>}
                                {form.product_file instanceof File && <p className="mb-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">{form.product_file.name}</p>}
                                <input accept=".pdf,.zip,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.ppt,.pptx" className={inputClass} onChange={(event) => setForm((current) => ({ ...current, product_file: event.target.files?.[0] ?? null }))} required={!editing && !form.product_url} type="file" />
                            </Field>
                            <Field className="sm:col-span-2" label="Cover image" hint="Images are optimized before they are saved.">
                                {form.image_url && !(form.image_file instanceof File) && <img alt="" className="mb-3 h-32 w-full rounded-2xl object-cover ring-1 ring-slate-200" src={mediaUrl(form.image_url)} />}
                                {form.image_file instanceof File && <p className="mb-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">{form.image_file.name}</p>}
                                <input accept="image/*" className={inputClass} onChange={(event) => setForm((current) => ({ ...current, image_file: event.target.files?.[0] ?? null }))} type="file" />
                            </Field>
                            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2"><input checked={form.active} className="size-4 accent-fuchsia-600" onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} type="checkbox" />Show on my public profile</label>
                            <div className="flex justify-end gap-2 sm:col-span-2">
                                <Button onClick={() => setShowForm(false)} type="button" variant="secondary">Cancel</Button>
                                <Button busy={saving} type="submit">{editing ? 'Save product' : 'Publish product'}</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
