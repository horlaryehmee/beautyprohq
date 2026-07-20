import { Card, CardHeader, EmptyState, ErrorState, LoadingBlock, PageHeader, StatCard, useApiResource } from '../../components/dashboard';

const normalize = (value, key) => Array.isArray(value) ? value : value?.[key] ?? [];

export default function ProviderAnalyticsPage() {
    const resource = useApiResource('/provider/analytics', {});
    const data = resource.data ?? {};
    const stats = data.stats ?? data.summary ?? data;
    const services = normalize(data, 'service_popularity');
    const views = normalize(data, 'profile_views_chart').length
        ? normalize(data, 'profile_views_chart')
        : normalize(data, 'views_over_time').length
          ? normalize(data, 'views_over_time')
          : normalize(data, 'profile_views');
    const pointValue = (point) => Number(point.value ?? point.views ?? point.count ?? point.total ?? 0);
    const viewTotal = Array.isArray(data.profile_views)
        ? data.profile_views.reduce((sum, point) => sum + pointValue(point), 0)
        : Number(data.profile_views ?? 0);
    const maxViews = Math.max(1, ...views.map(pointValue));
    const maxBookings = Math.max(1, ...services.map((service) => Number(service.bookings_count ?? service.count ?? 0)));

    return <div className="space-y-6">
        <PageHeader description="See what brings customers to your profile and turns visits into bookings." eyebrow="Performance" title="Analytics" />
        {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
        {resource.loading ? <LoadingBlock rows={6} /> : <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon="profile" label="Profile views" tone="sky" value={viewTotal} />
                <StatCard icon="booking" label="Booking requests" tone="plum" value={stats.booking_requests ?? stats.booking_count ?? stats.bookings ?? 0} />
                <StatCard icon="analytics" label="Conversion rate" note="Views to bookings" tone="emerald" value={`${Number(stats.conversion_rate ?? 0).toFixed(1)}%`} />
                <StatCard icon="loyalty" label="Completed bookings" tone="rose" value={stats.status_breakdown?.completed ?? stats.completed_bookings ?? 0} />
            </div>
            <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
                <Card>
                    <CardHeader description="Profile visits over the selected period." title="Visibility trend" />
                    {views.length ? <div className="flex h-64 items-end gap-2 pt-6">{views.map((point, index) => {
                        const value = pointValue(point);
                        return <div className="group flex h-full flex-1 flex-col items-center justify-end" key={`${point.label ?? point.date ?? point.viewed_on}-${index}`}><span className="mb-2 text-[10px] font-bold text-slate-600 opacity-0 transition group-hover:opacity-100">{value}</span><div className="w-full max-w-12 rounded-t-xl bg-gradient-to-t from-fuchsia-600 to-rose-400 transition hover:brightness-110" style={{ height: `${Math.max(4, (value / maxViews) * 85)}%` }} /><span className="mt-2 max-w-full truncate text-[10px] text-slate-400">{point.label ?? point.date ?? point.viewed_on}</span></div>;
                    })}</div> : <EmptyState description="Views will chart here once customers discover your profile." icon="analytics" title="No view data yet" />}
                </Card>
                <Card>
                    <CardHeader description="Services ranked by booking requests." title="Service popularity" />
                    {services.length ? <div className="space-y-4">{services.map((service) => {
                        const count = Number(service.bookings_count ?? service.count ?? 0);
                        const name = service.service?.name ?? service.name ?? 'Service';
                        return <div key={service.service_id ?? service.id ?? name}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate font-semibold text-slate-700">{name}</span><span className="font-bold text-slate-900">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${Math.max(3, (count / maxBookings) * 100)}%` }} /></div></div>;
                    })}</div> : <EmptyState description="Add services and receive bookings to see a ranking." icon="booking" title="No service data yet" />}
                </Card>
            </div>
        </>}
    </div>;
}
