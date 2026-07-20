import { useMemo, useState } from 'react';
import {
    Button,
    Card,
    CardHeader,
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
import { useCurrency } from '../../context/CurrencyContext';

const emptyService = {
    name: '',
    category: '',
    service_type: 'in_person',
    price: '',
    duration_minutes: 60,
    description: '',
    is_active: true,
};

const normalize = (value) => Array.isArray(value) ? value : value?.data ?? [];

const serviceTypes = [
    { label: 'In person', value: 'in_person' },
    { label: 'Mobile', value: 'mobile' },
    { label: 'Virtual', value: 'virtual' },
];

export default function ProviderServicesPage() {
    const resource = useApiResource('/provider/services', []);
    const profileResource = useApiResource('/provider/profile', {});
    const services = normalize(resource.data);
    const [form, setForm] = useState(emptyService);
    const [editing, setEditing] = useState(null);
    const [query, setQuery] = useState('');
    const [status, setStatus] = useState('all');
    const [saving, setSaving] = useState(false);
    const [currencySaving, setCurrencySaving] = useState(false);
    const { notify } = useDashboardToast();
    const { supported } = useCurrency();
    const defaultCurrency = profileResource.data?.default_currency ?? 'NGN';

    const filtered = useMemo(() => {
        const search = query.trim().toLowerCase();
        return services.filter((service) => {
            const matchesSearch = !search || [service.name, service.category, service.description, service.service_type].filter(Boolean).join(' ').toLowerCase().includes(search);
            const matchesStatus = status === 'all' || (status === 'active' ? service.is_active !== false : service.is_active === false);
            return matchesSearch && matchesStatus;
        });
    }, [query, services, status]);

    const summary = useMemo(() => ({
        total: services.length,
        active: services.filter((service) => service.is_active !== false).length,
        inactive: services.filter((service) => service.is_active === false).length,
        categories: new Set(services.map((service) => service.category).filter(Boolean)).size,
    }), [services]);

    const update = (key) => (event) => {
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        setForm((current) => ({ ...current, [key]: value }));
    };

    const startEdit = (service) => {
        setEditing(service);
        setForm({
            name: service.name ?? '',
            category: service.category ?? '',
            service_type: service.service_type ?? 'in_person',
            price: service.price ?? '',
            duration_minutes: service.duration_minutes ?? 60,
            description: service.description ?? '',
            is_active: service.is_active !== false,
        });
    };

    const resetForm = () => {
        setEditing(null);
        setForm(emptyService);
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...form,
                price: Number(form.price),
                duration_minutes: Number(form.duration_minutes),
                category: form.category || null,
                description: form.description || null,
                is_active: Boolean(form.is_active),
            };
            const saved = await apiRequest(editing ? 'put' : 'post', editing ? `/provider/services/${editing.id}` : '/provider/services', payload);
            resource.setData((current) => {
                const rows = normalize(current);
                return editing
                    ? rows.map((service) => service.id === editing.id ? { ...service, ...saved } : service)
                    : [...rows, saved];
            });
            notify(editing ? 'Service updated.' : 'Service added.');
            resetForm();
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (service) => {
        if (!window.confirm(`Remove ${service.name}? Services with bookings will be deactivated instead of deleted.`)) return;
        try {
            await apiRequest('delete', `/provider/services/${service.id}`);
            resource.setData((current) => normalize(current).filter((item) => item.id !== service.id));
            notify('Service removed.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    const toggleActive = async (service) => {
        try {
            const saved = await apiRequest('put', `/provider/services/${service.id}`, { is_active: service.is_active === false });
            resource.setData((current) => normalize(current).map((item) => item.id === service.id ? { ...item, ...saved } : item));
            notify(saved.is_active === false ? 'Service hidden from booking.' : 'Service is active.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    const updateDefaultCurrency = async (event) => {
        const default_currency = event.target.value;
        setCurrencySaving(true);
        try {
            const updated = await apiRequest('put', '/provider/profile', { default_currency });
            profileResource.setData((current) => ({ ...current, ...(updated ?? {}), default_currency }));
            notify('Pricing currency updated. New services and products will use this currency.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setCurrencySaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                description="Manage the services customers can view and book from your public profile."
                eyebrow="Provider workspace"
                title="Services"
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Pricing currency</p>
                    <p className="mt-1 text-sm text-slate-500">Used for new services, digital products, bookings, and provider payments.</p>
                </div>
                <div className="flex items-center gap-3">
                    {currencySaving && <span className="text-xs font-bold text-slate-400">Saving...</span>}
                    <select className={`${inputClass} min-w-52`} onChange={updateDefaultCurrency} value={defaultCurrency}>
                        {supported.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
                    </select>
                </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                    ['Total services', summary.total],
                    ['Active', summary.active],
                    ['Hidden', summary.inactive],
                    ['Categories', summary.categories],
                ].map(([label, value]) => (
                    <Card className="p-4" key={label}>
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                        <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_0.46fr]">
                <Card>
                    <CardHeader description="Search, edit, hide, or remove services." title="Service list" />

                    <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
                        <input className={inputClass} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, category, type, or description" type="search" value={query} />
                        <div className="flex rounded-2xl border border-slate-200 bg-white p-1">
                            {['all', 'active', 'hidden'].map((item) => (
                                <button
                                    className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition ${status === item ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                    key={item}
                                    onClick={() => setStatus(item)}
                                    type="button"
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>

                    {resource.loading ? <LoadingBlock rows={5} /> : filtered.length ? (
                        <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl border border-slate-100">
                            {filtered.map((service) => (
                                <div className="grid gap-4 bg-white p-4 transition hover:bg-slate-50/70 lg:grid-cols-[1fr_auto_auto]" key={service.id}>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="truncate font-black text-slate-950">{service.name}</h3>
                                            <StatusBadge status={service.is_active === false ? 'draft' : 'active'} />
                                            {service.category && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{service.category}</span>}
                                        </div>
                                        {service.description && <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-500">{service.description}</p>}
                                        <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{String(service.service_type ?? 'in_person').replace('_', ' ')} · {service.duration_minutes ?? 60} mins</p>
                                    </div>
                                    <div className="self-center text-left lg:text-right">
                                        <p className="text-lg font-black text-slate-950"><Currency currency={service.currency ?? 'NGN'} value={service.price} /></p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 self-center">
                                        <Button onClick={() => startEdit(service)} type="button" variant="secondary">Edit</Button>
                                        <Button onClick={() => toggleActive(service)} type="button" variant="soft">{service.is_active === false ? 'Activate' : 'Hide'}</Button>
                                        <Button onClick={() => remove(service)} type="button" variant="danger">Remove</Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <EmptyState description="Add your first service or adjust the filters." icon="booking" title="No services found" />}
                </Card>

                <Card className="h-fit xl:sticky xl:top-24">
                    <CardHeader description="This will appear on your profile and booking calendar." title={editing ? 'Edit service' : 'Add service'} />
                    <form className="space-y-4" onSubmit={save}>
                        <Field label="Service name">
                            <input className={inputClass} onChange={update('name')} required value={form.name} />
                        </Field>
                        <Field label="Category">
                            <input className={inputClass} onChange={update('category')} placeholder="Makeup, nails, hair..." value={form.category} />
                        </Field>
                        <Field label="Service type">
                            <select className={inputClass} onChange={update('service_type')} value={form.service_type}>
                                {serviceTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                        </Field>
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Price">
                                <input className={inputClass} min="0" onChange={update('price')} required type="number" value={form.price} />
                            </Field>
                            <Field label="Minutes">
                                <input className={inputClass} min="15" onChange={update('duration_minutes')} required step="15" type="number" value={form.duration_minutes} />
                            </Field>
                        </div>
                        <Field label="Description">
                            <textarea className={`${inputClass} min-h-28 resize-y`} onChange={update('description')} value={form.description} />
                        </Field>
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-700">
                            <input checked={form.is_active} className="size-4 accent-fuchsia-700" onChange={update('is_active')} type="checkbox" />
                            Show this service on my profile
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <Button busy={saving} type="submit">{editing ? 'Update service' : 'Add service'}</Button>
                            {editing && <Button onClick={resetForm} type="button" variant="secondary">Cancel</Button>}
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
}
