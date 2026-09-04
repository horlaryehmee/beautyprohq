import { useEffect, useMemo, useState } from 'react';
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
    Pagination,
    StatCard,
    StatusBadge,
    apiErrorMessage,
    apiRequest,
    formatDate,
    inputClass,
    useApiResource,
    useDashboardToast,
} from '../../components/dashboard';

const gateways = [
    { id: 'paystack', name: 'Paystack', description: 'Connect your own Paystack integration keys for NGN and USD booking payments.' },
    { id: 'manual', name: 'Manual payment', description: 'Add account details for bank transfer, cash, POS or other offline payment confirmation.' },
];

const normalize = (value, key) => Array.isArray(value) ? value : value?.[key] ?? value?.data ?? [];

function savedAccount(accounts, gatewayId) {
    return Array.isArray(accounts) ? accounts.find((item) => item.gateway === gatewayId) : accounts?.[gatewayId];
}

export default function ProviderPaymentsPage() {
    const [page, setPage] = useState(1);
    const [filterForm, setFilterForm] = useState({ search: '', status: 'all', date_from: '', date_to: '' });
    const [filters, setFilters] = useState(filterForm);
    const resource = useApiResource('/provider/payments', {}, {
        params: {
            page,
            per_page: 15,
            search: filters.search || undefined,
            status: filters.status === 'all' ? undefined : filters.status,
            date_from: filters.date_from || undefined,
            date_to: filters.date_to || undefined,
        },
    });
    const accountsResource = useApiResource('/provider/payment-accounts', {});
    const [activeGateway, setActiveGateway] = useState(null);
    const [account, setAccount] = useState({ public_key: '', secret_key: '', account_name: '', account_reference: '', instructions: '', enabled: true });
    const [saving, setSaving] = useState(false);
    const { notify } = useDashboardToast();
    const dashboard = resource.data ?? {};
    const paymentRows = normalize(dashboard, 'payments').length ? normalize(dashboard, 'payments') : normalize(dashboard, 'transactions');
    const accounts = accountsResource.data?.accounts ?? accountsResource.data ?? {};
    const totals = dashboard.stats ?? dashboard.summary ?? dashboard.meta?.summary ?? {};
    const pagination = dashboard.meta ?? {};
    const hasFilters = Boolean(filters.search || filters.status !== 'all' || filters.date_from || filters.date_to);

    const transactions = paymentRows.map((row) => row.payment ? {
        ...row.payment,
        booking: row,
        booking_id: row.id,
        service_name: row.service?.name,
        created_at: row.payment.created_at ?? row.created_at,
    } : row);

    useEffect(() => {
        if (!activeGateway) return;
        const saved = savedAccount(accounts, activeGateway.id);
        setAccount({
            public_key: saved?.public_key ?? '',
            secret_key: '',
            account_name: saved?.account_name ?? '',
            account_reference: saved?.account_reference ?? saved?.account_identifier ?? '',
            instructions: saved?.instructions ?? '',
            enabled: saved?.enabled ?? saved?.is_connected ?? true,
        });
    }, [accounts, activeGateway]);

    const paidTotal = useMemo(
        () => transactions.filter((item) => item.status === 'paid' || item.status === 'completed').reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
        [transactions],
    );

    const saveAccount = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await apiRequest('put', '/provider/payment-accounts', {
                gateway: activeGateway.id,
                public_key: account.public_key,
                account_name: account.account_name,
                account_reference: account.account_reference,
                account_identifier: account.account_reference,
                ...(activeGateway.id === 'manual' ? { instructions: account.instructions } : {}),
                enabled: account.enabled,
                settings: {
                    ...(account.secret_key ? { secret_key: account.secret_key } : {}),
                },
            });
            await accountsResource.reload(true);
            setActiveGateway(null);
            notify(`${activeGateway.name} connection saved.`);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        } finally {
            setSaving(false);
        }
    };
    const activeSavedAccount = activeGateway ? savedAccount(accounts, activeGateway.id) : null;

    const applyFilters = (event) => {
        event.preventDefault();
        if (filterForm.date_from && filterForm.date_to && filterForm.date_from > filterForm.date_to) {
            notify('The start date must be before or equal to the end date.', 'error');
            return;
        }
        setPage(1);
        setFilters({ ...filterForm, search: filterForm.search.trim() });
    };

    const clearFilters = () => {
        const emptyFilters = { search: '', status: 'all', date_from: '', date_to: '' };
        setFilterForm(emptyFilters);
        setFilters(emptyFilters);
        setPage(1);
    };

    return (
        <div className="space-y-6">
            <PageHeader description="Connect your own account so customer payments can settle directly to you." eyebrow="Money" title="Payments" />

            <div className="grid gap-4 sm:grid-cols-3">
                <StatCard icon="wallet" label="Paid out" tone="emerald" value={<Currency value={totals.paid ?? totals.total_paid ?? paidTotal} />} />
                <StatCard icon="booking" label="Pending" tone="amber" value={<Currency value={totals.pending ?? totals.pending_amount ?? 0} />} />
                <StatCard icon="analytics" label="Transactions" tone="sky" value={totals.transactions ?? pagination.total ?? transactions.length} />
            </div>

            {(resource.error || accountsResource.error) && (
                <ErrorState message={resource.error || accountsResource.error} onRetry={() => { resource.reload(); accountsResource.reload(); }} />
            )}

            <Card>
                <CardHeader
                    description="Customer booking payments are routed only to the connected account saved on the exact provider profile being booked."
                    title="Payment gateways"
                />
                <div className="grid gap-3 md:grid-cols-2">
                    {gateways.map((gateway) => {
                        const saved = savedAccount(accounts, gateway.id);

                        return (
                            <div className="rounded-2xl border border-slate-100 p-4" key={gateway.id}>
                                <div className="flex items-start justify-between gap-3">
                                    <span className="grid size-11 place-items-center rounded-2xl bg-slate-950 text-xs font-semibold uppercase text-white">{gateway.name.slice(0, 2)}</span>
                                    {(saved?.enabled ?? saved?.is_connected) && <StatusBadge status="active" />}
                                </div>
                                <h2 className="mt-4 font-bold text-slate-950">{gateway.name}</h2>
                                <p className="mt-1 min-h-10 text-sm leading-5 text-slate-500">{gateway.description}</p>
                                {gateway.id === 'paystack' && (
                                    <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700">
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1">NGN</span>
                                        <span className="rounded-full bg-emerald-50 px-2.5 py-1">USD</span>
                                        <span className="font-semibold text-slate-500">supported</span>
                                    </div>
                                )}
                                <Button className="mt-4 w-full" onClick={() => setActiveGateway(gateway)} type="button" variant={saved ? 'secondary' : 'primary'}>
                                    {saved ? 'Manage' : 'Connect'}
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card>
                <CardHeader description="Search the full payment history or narrow it by status and payment date." title="Transactions" />
                <form className="mb-6 rounded-2xl border border-slate-100 bg-slate-50/70 p-4" onSubmit={applyFilters}>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_minmax(150px,.7fr)_minmax(150px,.8fr)_minmax(150px,.8fr)_auto] xl:items-end">
                        <Field label="Search">
                            <input
                                className={inputClass}
                                onChange={(event) => setFilterForm((current) => ({ ...current, search: event.target.value }))}
                                placeholder="Reference, service or customer"
                                type="search"
                                value={filterForm.search}
                            />
                        </Field>
                        <Field label="Status">
                            <select className={inputClass} onChange={(event) => setFilterForm((current) => ({ ...current, status: event.target.value }))} value={filterForm.status}>
                                <option value="all">All statuses</option>
                                <option value="pending">Pending</option>
                                <option value="processing">Processing</option>
                                <option value="paid">Paid</option>
                                <option value="failed">Failed</option>
                                <option value="refunded">Refunded</option>
                            </select>
                        </Field>
                        <Field label="From">
                            <input className={inputClass} onChange={(event) => setFilterForm((current) => ({ ...current, date_from: event.target.value }))} type="date" value={filterForm.date_from} />
                        </Field>
                        <Field label="To">
                            <input className={inputClass} min={filterForm.date_from || undefined} onChange={(event) => setFilterForm((current) => ({ ...current, date_to: event.target.value }))} type="date" value={filterForm.date_to} />
                        </Field>
                        <div className="flex gap-2">
                            <Button className="flex-1 xl:flex-none" type="submit">Apply</Button>
                            {(hasFilters || filterForm.search || filterForm.status !== 'all' || filterForm.date_from || filterForm.date_to) && (
                                <Button onClick={clearFilters} type="button" variant="secondary">Clear</Button>
                            )}
                        </div>
                    </div>
                </form>
                {resource.loading ? (
                    <LoadingBlock rows={5} />
                ) : transactions.length ? (
                    <div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[680px] text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                                        <th className="pb-3 font-bold">Reference</th>
                                        <th className="pb-3 font-bold">Booking</th>
                                        <th className="pb-3 font-bold">Date</th>
                                        <th className="pb-3 font-bold">Amount</th>
                                        <th className="pb-3 text-right font-bold">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map((payment) => (
                                        <tr className="border-b border-slate-50 last:border-0" key={payment.id}>
                                            <td className="py-4 font-semibold text-slate-800">{payment.reference ?? `BPHQ-${payment.id}`}</td>
                                            <td className="py-4 text-slate-500">{payment.booking?.service?.name ?? payment.service_name ?? `#${payment.booking_id}`}</td>
                                            <td className="py-4 text-slate-500">{formatDate(payment.created_at)}</td>
                                            <td className="py-4 font-bold text-slate-900"><Currency currency={payment.currency ?? 'NGN'} value={payment.amount} /></td>
                                            <td className="py-4 text-right"><StatusBadge status={payment.status} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {Number(pagination.last_page ?? 1) > 1 && (
                            <Pagination page={pagination.current_page ?? page} pageCount={pagination.last_page} onPageChange={setPage} />
                        )}
                    </div>
                ) : (
                    <EmptyState
                        description={hasFilters ? 'Try changing or clearing the filters to see more results.' : 'Completed booking payments will appear here.'}
                        icon="wallet"
                        title={hasFilters ? 'No matching transactions' : 'No transactions yet'}
                    />
                )}
            </Card>

            {activeGateway && (
                <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4" onMouseDown={() => setActiveGateway(null)}>
                    <Card className="w-full max-w-lg rounded-b-none sm:rounded-3xl" onMouseDown={(event) => event.stopPropagation()}>
                        <h2 className="text-lg font-bold text-slate-950">Connect {activeGateway.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {activeGateway.id === 'manual'
                                ? 'Customers can choose this option and pay using the details you provide. You will confirm payment before accepting the booking.'
                                : `Use the credentials from your own ${activeGateway.name} dashboard. Booking payments will be initialized and verified on that provider account.`}
                        </p>
                        <form autoComplete="off" className="mt-5 space-y-4" onSubmit={saveAccount}>
                            {activeGateway.id === 'manual' ? (
                                <>
                                    <Field label="Account name">
                                        <input className={inputClass} onChange={(event) => setAccount((current) => ({ ...current, account_name: event.target.value }))} placeholder="Business or account name" required value={account.account_name} />
                                    </Field>
                                    <Field hint="Bank name, account number, POS instruction, cash instruction, or any manual payment details customers need." label="Account details">
                                        <textarea className={`${inputClass} min-h-24 py-3`} onChange={(event) => setAccount((current) => ({ ...current, account_reference: event.target.value }))} placeholder="Bank: Example Bank&#10;Account number: 0000000000" required value={account.account_reference} />
                                    </Field>
                                    <Field hint="Optional extra instructions shown after the customer creates the booking." label="Payment instructions">
                                        <textarea className={`${inputClass} min-h-24 py-3`} onChange={(event) => setAccount((current) => ({ ...current, instructions: event.target.value }))} placeholder="Send receipt by WhatsApp after payment." value={account.instructions} />
                                    </Field>
                                </>
                            ) : (
                                <>
                                    {activeGateway.id === 'paystack' && (
                                        <>
                                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                                                <p className="font-bold">Supported currencies: NGN and USD</p>
                                                <p className="mt-1 text-xs leading-5 text-emerald-800">NGN is available by default for Nigerian Paystack businesses. To charge customers in USD, first enable USD payments and add an eligible USD settlement account in your Paystack dashboard.</p>
                                            </div>
                                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                                                <p className="font-semibold text-slate-950">Paystack webhook URL</p>
                                                <p className="mt-2 break-all font-mono text-xs text-slate-700">{activeSavedAccount?.webhook_url ?? 'Save this Paystack account to generate its unique webhook URL.'}</p>
                                                <p className="mt-2 text-xs leading-5">Use this in the Paystack dashboard for this provider account so booking payments can be confirmed automatically.</p>
                                            </div>
                                        </>
                                    )}
                                    <Field label={activeGateway.id === 'paypal' ? 'PayPal client ID' : `${activeGateway.name} public key`}>
                                        <input
                                            autoComplete="off"
                                            className={inputClass}
                                            name={`${activeGateway.id}_public_credential`}
                                            onChange={(event) => setAccount((current) => ({ ...current, public_key: event.target.value }))}
                                            placeholder={activeGateway.id === 'paypal' ? 'Paste PayPal REST app client ID' : 'Paste public key'}
                                            required
                                            type="text"
                                            value={account.public_key}
                                        />
                                    </Field>

                                    <Field hint="Encrypted after saving. Leave blank when editing to keep the saved key." label={activeGateway.id === 'paypal' ? 'PayPal client secret' : `${activeGateway.name} secret key`}>
                                        <input
                                            autoComplete="new-password"
                                            className={inputClass}
                                            name={`${activeGateway.id}_secret_credential`}
                                            onChange={(event) => setAccount((current) => ({ ...current, secret_key: event.target.value }))}
                                            placeholder={activeSavedAccount?.has_secret_key ? 'Saved - leave blank to keep current key' : activeGateway.id === 'paypal' ? 'Paste PayPal REST app secret' : 'Paste secret key'}
                                            type="password"
                                            value={account.secret_key}
                                        />
                                    </Field>
                                </>
                            )}

                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                <input
                                    checked={account.enabled}
                                    className="size-4 accent-fuchsia-600"
                                    onChange={(event) => setAccount((current) => ({ ...current, enabled: event.target.checked }))}
                                    type="checkbox"
                                />
                                Accept booking payments through this gateway
                            </label>

                            <div className="flex justify-end gap-2">
                                <Button onClick={() => setActiveGateway(null)} type="button" variant="secondary">Cancel</Button>
                                <Button busy={saving} type="submit">Save connection</Button>
                            </div>
                        </form>
                    </Card>
                </div>
            )}
        </div>
    );
}
