import { Link } from 'react-router-dom';
import {
    Avatar,
    Button,
    Card,
    CardHeader,
    Currency,
    EmptyState,
    ErrorState,
    LoadingBlock,
    PageHeader,
    StatCard,
    StatusBadge,
    formatDate,
    useApiResource,
} from '../../components/dashboard';

const list = (value) => Array.isArray(value) ? value : value?.data ?? [];
const objectEntries = (value) => Object.entries(value ?? {});
const number = (value) => Number(value ?? 0);
const compact = (value) => new Intl.NumberFormat('en-NG', { notation: Number(value ?? 0) >= 10000 ? 'compact' : 'standard' }).format(Number(value ?? 0));
const percent = (value) => `${Number(value ?? 0).toFixed(1)}%`;
const money = (value) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(value ?? 0));

function MiniBars({ items }) {
    const rows = list(items);
    const max = Math.max(...rows.map((item) => number(item.total)), 1);

    return (
        <div className="flex h-32 items-end gap-1.5">
            {rows.length ? rows.map((item) => {
                const height = Math.max(8, (number(item.total) / max) * 100);
                return (
                    <div className="flex flex-1 flex-col items-center justify-end gap-2" key={item.viewed_on}>
                        <div
                            className="w-full rounded-t-lg bg-gradient-to-t from-fuchsia-700 to-fuchsia-300"
                            style={{ height: `${height}%` }}
                            title={`${item.total} views`}
                        />
                    </div>
                );
            }) : <p className="self-center text-sm text-slate-400">No profile views yet.</p>}
        </div>
    );
}

function MetricRow({ label, value, tone = 'bg-slate-900' }) {
    return (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 px-4 py-3">
            <span className="text-sm font-medium text-slate-500">{label}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-bold text-white ${tone}`}>{value}</span>
        </div>
    );
}

function BreakdownList({ items, empty = 'No data yet.' }) {
    const rows = objectEntries(items);
    const max = Math.max(...rows.map(([, value]) => number(value)), 1);

    if (!rows.length) {
        return <p className="py-6 text-center text-sm text-slate-400">{empty}</p>;
    }

    return (
        <div className="space-y-3">
            {rows.map(([label, value]) => (
                <div key={label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-semibold capitalize text-slate-700">{label.replaceAll('_', ' ')}</span>
                        <span className="text-slate-500">{value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-950" style={{ width: `${Math.max(6, (number(value) / max) * 100)}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default function ProviderOverviewPage() {
    const resource = useApiResource('/provider/dashboard', {}, { refreshInterval: 30000 });
    const dashboard = resource.data ?? {};
    const stats = dashboard.stats ?? dashboard.summary ?? {};
    const analytics = dashboard.analytics ?? {};
    const market = analytics.market_location ?? {};
    const profileCompletion = dashboard.profile_completion ?? 0;
    const upcoming = list(dashboard.upcoming_bookings ?? dashboard.bookings);
    const notifications = list(dashboard.notifications);
    const isPaidPlan = Boolean(dashboard.is_paid_plan);

    if (!isPaidPlan) {
        return (
            <div className="space-y-7">
                <PageHeader
                    description="Your free plan includes directory visibility, client reviews, and email notifications."
                    eyebrow="Free provider plan"
                    title="Your listing dashboard"
                    actions={<Link to="/provider/subscription"><Button>Upgrade plan</Button></Link>}
                />

                {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

                <div className="grid gap-4 sm:grid-cols-3">
                    <StatCard icon="profile" label="Directory listing" note="Basic public profile" tone="plum" value={profileCompletion >= 80 ? 'Ready' : 'Setup'} />
                    <StatCard icon="analytics" label="Client reviews" note="Based on public reviews" tone="amber" value={Number(stats.rating ?? 0).toFixed(1)} />
                    <StatCard icon="bell" label="Email activity" note="Notifications enabled" tone="sky" value="On" />
                </div>

                <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
                    <Card>
                        <CardHeader description="Complete these fields to make your basic listing stronger." title="Listing health" />
                        <div>
                            <div className="mb-2 flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-700">Profile completion</span>
                                <span className="font-bold text-slate-950">{profileCompletion}%</span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-fuchsia-700" style={{ width: `${Math.min(100, Math.max(0, profileCompletion))}%` }} />
                            </div>
                        </div>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <MetricRow label="Location" value={market.location ?? 'Not set'} />
                            <MetricRow label="Reviews" value={compact(stats.review_count)} />
                        </div>
                        <Link to="/provider/profile"><Button className="mt-5" type="button" variant="secondary">Edit listing</Button></Link>
                    </Card>

                    <Card className="bg-slate-950 text-white">
                        <p className="text-xs font-bold uppercase tracking-[0.15em] text-fuchsia-200">Paid plan</p>
                        <h2 className="mt-2 text-2xl font-black">Unlock business tools</h2>
                        <p className="mt-2 text-sm leading-6 text-white/65">Upgrade to use services, direct bookings, calendar, CRM, loyalty, payments, digital products, content calendar, and analytics.</p>
                        <Link to="/provider/subscription"><Button className="mt-5 bg-white text-slate-950 hover:bg-fuchsia-50" variant="secondary">View paid plan</Button></Link>
                    </Card>
                </div>

                <Card>
                    <CardHeader title="Recent activity" />
                    {resource.loading ? <LoadingBlock rows={2} /> : notifications.length ? (
                        <div className="space-y-4">
                            {notifications.slice(0, 5).map((notification) => (
                                <div className="flex gap-3" key={notification.id}>
                                    <span className="mt-1 size-2 shrink-0 rounded-full bg-fuchsia-500" />
                                    <div>
                                        <p className="text-sm font-semibold leading-5 text-slate-800">{notification.title ?? notification.data?.title ?? 'Account update'}</p>
                                        <p className="mt-0.5 text-xs leading-5 text-slate-400">{notification.message ?? notification.data?.message}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <p className="py-8 text-center text-sm text-slate-400">You’re all caught up.</p>}
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-7">
            <PageHeader
                description="A quick look at bookings, clients and how your business is growing."
                eyebrow="Provider workspace"
                title="Your business at a glance"
                actions={<Link to="/provider/calendar"><Button>Update availability</Button></Link>}
            />

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon="profile" label="Profile views" note={`${compact(stats.monthly_profile_views)} in the last 30 days`} tone="sky" value={compact(stats.profile_views)} />
                <StatCard icon="analytics" label="Conversion rate" note="Bookings from profile views" tone="plum" value={percent(stats.conversion_rate)} />
                <StatCard icon="booking" label="Total bookings" note={`${compact(stats.upcoming_bookings)} upcoming · ${compact(stats.pending_bookings)} pending`} tone="amber" value={compact(stats.total_bookings)} />
                <StatCard icon="wallet" label="Revenue" note={`${money(stats.monthly_revenue)} this month`} tone="emerald" value={<Currency value={stats.total_revenue} />} />
                <StatCard icon="profile" label="Customers" note="Unique customers booked" tone="plum" value={compact(stats.customer_count)} />
                <StatCard icon="content" label="Services" note="Active services listed" tone="sky" value={compact(stats.service_count)} />
                <StatCard icon="analytics" label="Average rating" note={`${compact(stats.review_count)} reviews`} tone="amber" value={Number(stats.rating ?? stats.average_rating ?? 0).toFixed(1)} />
                <StatCard icon="booking" label="Completed" note={`${compact(stats.cancelled_bookings)} cancelled/rejected`} tone="emerald" value={compact(stats.completed_bookings)} />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <Card>
                    <CardHeader description="Views recorded over the last 30 days" title="Profile views trend" />
                    {resource.loading ? <LoadingBlock rows={2} /> : <MiniBars items={analytics.profile_views} />}
                </Card>

                <Card>
                    <CardHeader description="Keep your market and profile ready for bookings" title="Profile health" />
                    <div className="space-y-4">
                        <div>
                            <div className="mb-2 flex items-center justify-between text-sm">
                                <span className="font-semibold text-slate-700">Profile completion</span>
                                <span className="font-bold text-slate-950">{profileCompletion}%</span>
                            </div>
                            <div className="h-3 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-fuchsia-700" style={{ width: `${Math.min(100, Math.max(0, profileCompletion))}%` }} />
                            </div>
                        </div>
                        <MetricRow label="Verification" tone={dashboard.verification_status === 'approved' ? 'bg-emerald-600' : 'bg-amber-500'} value={String(dashboard.verification_status ?? 'not submitted').replaceAll('_', ' ')} />
                        <MetricRow label="Location" value={market.location ?? 'Not set'} />
                        <MetricRow label="Country" value={market.country ?? 'Not set'} />
                    </div>
                </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-3">
                <Card>
                    <CardHeader title="Booking status" />
                    {resource.loading ? <LoadingBlock rows={3} /> : <BreakdownList items={analytics.status_breakdown} />}
                </Card>

                <Card>
                    <CardHeader title="Popular services" />
                    {resource.loading ? <LoadingBlock rows={3} /> : list(analytics.service_popularity).length ? (
                        <div className="space-y-3">
                            {list(analytics.service_popularity).map((item) => (
                                <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 px-4 py-3" key={item.service_id ?? item.id}>
                                    <span className="min-w-0 truncate text-sm font-semibold text-slate-700">{item.service?.name ?? 'Deleted service'}</span>
                                    <span className="rounded-full bg-fuchsia-50 px-3 py-1 text-xs font-bold text-fuchsia-700">{compact(item.bookings_count)} bookings</span>
                                </div>
                            ))}
                        </div>
                    ) : <p className="py-6 text-center text-sm text-slate-400">Bookings by service will appear here.</p>}
                </Card>

                <Card>
                    <CardHeader title="Payment status" />
                    {resource.loading ? <LoadingBlock rows={3} /> : <BreakdownList empty="No payment records yet." items={analytics.payment_status} />}
                </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.55fr_1fr]">
                <Card>
                    <CardHeader action={<Link className="text-sm font-bold text-fuchsia-700 hover:text-fuchsia-800" to="/provider/bookings">View all</Link>} description="Your next customer appointments" title="Upcoming bookings" />
                    {resource.loading ? <LoadingBlock /> : upcoming.length ? (
                        <div className="space-y-3">
                            {upcoming.slice(0, 5).map((booking) => {
                                const customer = booking.customer ?? {};
                                return (
                                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 p-3.5 transition hover:border-fuchsia-100 hover:bg-fuchsia-50/30 sm:flex-row sm:items-center" key={booking.id}>
                                        <Avatar name={customer.name} src={customer.profile_photo} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-slate-900">{customer.name ?? 'Customer'}</p>
                                            <p className="truncate text-xs text-slate-500">{booking.service?.name ?? booking.service_name ?? 'Beauty service'}</p>
                                        </div>
                                        <div className="sm:text-right">
                                            <p className="text-sm font-semibold text-slate-800">{formatDate(booking.date ?? booking.starts_at, { year: undefined })}</p>
                                            <p className="text-xs text-slate-400">{booking.time ?? booking.start_time ?? ''}</p>
                                        </div>
                                        <StatusBadge status={booking.status} />
                                    </div>
                                );
                            })}
                        </div>
                    ) : <EmptyState description="New booking requests will appear here." icon="calendar" title="No upcoming bookings" />}
                </Card>

                <div className="space-y-5">
                    <Card>
                        <CardHeader title="Recent activity" />
                        {resource.loading ? <LoadingBlock rows={2} /> : notifications.length ? (
                            <div className="space-y-4">
                                {notifications.slice(0, 4).map((notification) => (
                                    <div className="flex gap-3" key={notification.id}>
                                        <span className="mt-1 size-2 shrink-0 rounded-full bg-fuchsia-500" />
                                        <div>
                                            <p className="text-sm font-semibold leading-5 text-slate-800">{notification.title ?? notification.data?.title ?? 'Account update'}</p>
                                            <p className="mt-0.5 text-xs leading-5 text-slate-400">{notification.message ?? notification.data?.message}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p className="py-8 text-center text-sm text-slate-400">You’re all caught up.</p>}
                    </Card>

                    {dashboard.verification_status !== 'approved' && !dashboard.verified && !dashboard.profile?.verified && (
                        <Card className="overflow-hidden bg-gradient-to-br from-slate-950 to-fuchsia-950 text-white">
                            <p className="text-xs font-bold uppercase tracking-[0.15em] text-fuchsia-200">Get verified</p>
                            <h2 className="mt-2 text-xl font-bold">Unlock CRM and loyalty tools</h2>
                            <p className="mt-2 text-sm leading-6 text-white/60">Submit your work and certification details for review.</p>
                            <Link to="/provider/profile"><Button className="mt-5 bg-white text-slate-950 hover:bg-fuchsia-50" variant="secondary">Start verification</Button></Link>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
