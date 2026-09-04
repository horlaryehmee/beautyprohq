import { useMemo, useState } from 'react';
import {
    Area,
    CartesianGrid,
    ComposedChart,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
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
    inputClass,
    useApiResource,
} from '../../components/dashboard';

const normalize = (value, key) => Array.isArray(value) ? value : value?.[key] ?? [];
const pad = (value) => String(value).padStart(2, '0');
const dateInput = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value) => new Date(`${value}T12:00:00`);

function initialRange(days = 30) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days + 1);
    return { from: dateInput(from), to: dateInput(to) };
}

function previousRange({ from, to }) {
    const currentFrom = parseDate(from);
    const currentTo = parseDate(to);
    const days = Math.round((currentTo - currentFrom) / 86400000) + 1;
    const compareTo = new Date(currentFrom);
    compareTo.setDate(compareTo.getDate() - 1);
    const compareFrom = new Date(compareTo);
    compareFrom.setDate(compareFrom.getDate() - days + 1);
    return { compareFrom: dateInput(compareFrom), compareTo: dateInput(compareTo) };
}

function formatRange(range) {
    if (!range?.from || !range?.to) return '';
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return `${parseDate(range.from).toLocaleDateString([], options)} – ${parseDate(range.to).toLocaleDateString([], options)}`;
}

function changeLabel(current, previous, points = false) {
    const value = Number(current ?? 0);
    const oldValue = Number(previous ?? 0);
    if (!oldValue) return value ? { label: 'New', positive: true } : { label: 'No change', neutral: true };
    const change = points ? value - oldValue : ((value - oldValue) / Math.abs(oldValue)) * 100;
    return {
        label: `${change > 0 ? '+' : ''}${change.toFixed(1)}${points ? ' pts' : '%'}`,
        positive: change > 0,
        negative: change < 0,
        neutral: change === 0,
    };
}

function MetricCard({ label, value, note, current, previous, points = false }) {
    const change = previous === undefined || previous === null ? null : changeLabel(current, previous, points);
    return (
        <Card className="min-w-0 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-500">{label}</p>
                {change && <span className={`rounded-full px-2 py-1 text-[10px] font-black ${change.positive ? 'bg-emerald-50 text-emerald-700' : change.negative ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{change.label}</span>}
            </div>
            <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</div>
            {note && <p className="mt-1 text-xs leading-5 text-slate-400">{note}</p>}
        </Card>
    );
}

const statusColors = {
    pending: 'bg-amber-500',
    confirmed: 'bg-sky-500',
    completed: 'bg-emerald-500',
    cancelled: 'bg-rose-500',
    rejected: 'bg-red-700',
};

const trendMetrics = {
    views: 'Profile views',
    bookings: 'Booking requests',
};

const trendColors = {
    current: '#14b8a6',
    comparison: '#ec4899',
};

function ChartLegendItem({ color, dashed = false, label }) {
    return (
        <span className="flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-500">
            <i
                className={`size-3.5 rounded-full border-[4px] bg-white ${dashed ? 'border-dashed' : ''}`}
                style={{ borderColor: color }}
            />
            {label}
        </span>
    );
}

function TrendTooltip({ active, payload, metricLabel, showComparison }) {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;

    const currentValue = Number(point.current ?? 0);
    const comparisonValue = Number(point.comparison ?? 0);
    const change = comparisonValue > 0 ? ((currentValue - comparisonValue) / comparisonValue) * 100 : null;

    return (
        <div className="min-w-[210px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10">
            <p className="mb-2.5 text-xs font-semibold tracking-wide text-slate-500">{point.dateLabel}</p>
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-5 text-xs">
                    <ChartLegendItem color={trendColors.current} label="Selected period" />
                    <span className="font-bold tabular-nums text-slate-950">{currentValue.toLocaleString()}</span>
                </div>
                {showComparison && point.comparison !== null && (
                    <div className="flex items-center justify-between gap-5 text-xs">
                        <ChartLegendItem color={trendColors.comparison} dashed label="Comparison" />
                        <span className="font-bold tabular-nums text-slate-950">{comparisonValue.toLocaleString()}</span>
                    </div>
                )}
            </div>
            {showComparison && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                    <span className="text-slate-500">{metricLabel} change</span>
                    <span className={`rounded-full px-2 py-1 font-black ${change === null ? 'bg-slate-100 text-slate-500' : change >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {change === null ? (currentValue > 0 ? 'New' : 'No change') : `${change > 0 ? '+' : ''}${change.toFixed(1)}%`}
                    </span>
                </div>
            )}
            {showComparison && point.comparisonDateLabel && <p className="mt-2 text-[10px] text-slate-400">Compared with {point.comparisonDateLabel}</p>}
        </div>
    );
}

export default function ProviderAnalyticsPage() {
    const baseRange = useMemo(() => initialRange(), []);
    const baseComparison = useMemo(() => previousRange(baseRange), [baseRange]);
    const [draft, setDraft] = useState({ ...baseRange, compare: false, ...baseComparison });
    const [applied, setApplied] = useState({ ...baseRange, compare: false, ...baseComparison });
    const [trendMetric, setTrendMetric] = useState('views');
    const [filterError, setFilterError] = useState('');
    const params = {
        date_from: applied.from,
        date_to: applied.to,
        ...(applied.compare ? { compare_date_from: applied.compareFrom, compare_date_to: applied.compareTo } : {}),
    };
    const resource = useApiResource('/provider/analytics', {}, { params });
    const data = resource.data ?? {};
    const current = data.current ?? data;
    const comparison = data.comparison ?? null;
    const services = normalize(current, 'service_popularity');
    const trend = normalize(current, 'trend');
    const comparisonTrend = normalize(comparison, 'trend');
    const statuses = Object.entries(current.status_breakdown ?? {});
    const chartData = useMemo(() => trend.map((point, index) => {
        const comparisonIndex = comparisonTrend.length <= 1 || trend.length <= 1
            ? 0
            : Math.round((index / (trend.length - 1)) * (comparisonTrend.length - 1));
        const comparisonPoint = comparisonTrend[comparisonIndex];

        return {
            label: point.label,
            dateLabel: point.label,
            current: Number(point[trendMetric] ?? 0),
            currentArea: Number(point[trendMetric] ?? 0),
            comparison: comparisonPoint ? Number(comparisonPoint[trendMetric] ?? 0) : null,
            comparisonDateLabel: comparisonPoint?.label ?? null,
        };
    }), [comparisonTrend, trend, trendMetric]);
    const hasTrendPoints = chartData.length > 0;
    const maxBookings = Math.max(1, ...services.map((service) => Number(service.bookings_count ?? 0)));

    const setQuickRange = (key) => {
        const now = new Date();
        let range;
        if (key === 'month') range = { from: dateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: dateInput(now) };
        else if (key === 'year') range = { from: dateInput(new Date(now.getFullYear(), 0, 1)), to: dateInput(now) };
        else range = initialRange(Number(key));
        setDraft((existing) => ({ ...existing, ...range, ...previousRange(range) }));
    };

    const applyFilters = (event) => {
        event.preventDefault();
        if (!draft.from || !draft.to || draft.from > draft.to) {
            setFilterError('Choose a valid start and end date.');
            return;
        }
        if (draft.compare && (!draft.compareFrom || !draft.compareTo || draft.compareFrom > draft.compareTo)) {
            setFilterError('Choose a valid comparison date range.');
            return;
        }
        setFilterError('');
        setApplied({ ...draft });
    };

    return (
        <div className="space-y-6">
            <PageHeader description="Track visibility, bookings, customers and revenue across any reporting period." eyebrow="Performance" title="Analytics" />

            <Card className="overflow-hidden" padding={false}>
                <div className="border-b border-bphq-chrome/70 bg-gradient-to-br from-bphq-ivory via-white to-fuchsia-50 p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.16em] text-bphq-coffee">Reporting period</p>
                            <h2 className="mt-1 font-display text-2xl font-semibold text-bphq-espresso">Choose the dates you want to understand</h2>
                            <p className="mt-1 text-sm text-bphq-coffee">{formatRange(current.range ?? applied)}{comparison ? ` compared with ${formatRange(comparison.range)}` : ''}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['month', 'This month'], ['year', 'This year']].map(([key, label]) => (
                                <button className="rounded-xl border border-bphq-chrome bg-white px-3 py-2 text-xs font-bold text-bphq-coffee transition hover:border-bphq-coffee hover:text-bphq-espresso" key={key} onClick={() => setQuickRange(key)} type="button">{label}</button>
                            ))}
                        </div>
                    </div>
                </div>

                <form className="p-5 sm:p-6" onSubmit={applyFilters}>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
                        <Field label="From"><input className={inputClass} max={draft.to} onChange={(event) => setDraft((value) => ({ ...value, from: event.target.value }))} required type="date" value={draft.from} /></Field>
                        <Field label="To"><input className={inputClass} min={draft.from} onChange={(event) => setDraft((value) => ({ ...value, to: event.target.value }))} required type="date" value={draft.to} /></Field>
                        <Button className="w-full md:col-span-2 xl:col-span-1 xl:w-auto" type="submit">Apply dates</Button>
                    </div>

                    <label className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <input checked={draft.compare} className="mt-0.5 size-4 accent-fuchsia-700" onChange={(event) => setDraft((value) => ({ ...value, compare: event.target.checked, ...(!value.compare ? previousRange(value) : {}) }))} type="checkbox" />
                        <span><span className="block text-sm font-bold text-slate-800">Compare with another period</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">See the change between this range and any earlier date range.</span></span>
                    </label>

                    {draft.compare && (
                        <div className="mt-4 grid gap-4 rounded-2xl border border-fuchsia-100 bg-fuchsia-50/50 p-4 md:grid-cols-2">
                            <Field label="Comparison from"><input className={inputClass} max={draft.compareTo} onChange={(event) => setDraft((value) => ({ ...value, compareFrom: event.target.value }))} required type="date" value={draft.compareFrom} /></Field>
                            <Field label="Comparison to"><input className={inputClass} min={draft.compareFrom} onChange={(event) => setDraft((value) => ({ ...value, compareTo: event.target.value }))} required type="date" value={draft.compareTo} /></Field>
                        </div>
                    )}
                    {filterError && <p className="mt-3 text-sm font-semibold text-rose-600">{filterError}</p>}
                </form>
            </Card>

            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            {resource.loading ? <LoadingBlock rows={8} /> : <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard current={current.profile_view_count} label="Profile views" previous={comparison?.profile_view_count} value={Number(current.profile_view_count ?? 0).toLocaleString()} />
                    <MetricCard current={current.booking_count} label="Booking requests" previous={comparison?.booking_count} value={Number(current.booking_count ?? 0).toLocaleString()} />
                    <MetricCard current={current.revenue} label="Paid revenue" note={`All current pricing uses ${current.revenue_currency ?? 'NGN'}`} previous={comparison?.revenue} value={<Currency currency={current.revenue_currency ?? 'NGN'} value={current.revenue ?? 0} />} />
                    <MetricCard current={current.conversion_rate} label="View-to-booking conversion" points previous={comparison?.conversion_rate} value={`${Number(current.conversion_rate ?? 0).toFixed(1)}%`} />
                    <MetricCard current={current.completed_booking_count} label="Completed bookings" previous={comparison?.completed_booking_count} value={Number(current.completed_booking_count ?? 0).toLocaleString()} />
                    <MetricCard current={current.unique_customers} label="Unique customers" previous={comparison?.unique_customers} value={Number(current.unique_customers ?? 0).toLocaleString()} />
                    <MetricCard current={current.customer_retention_rate} label="Customer retention" note={`${Number(current.returning_customers ?? 0)} returning customers`} points previous={comparison?.customer_retention_rate} value={`${Number(current.customer_retention_rate ?? 0).toFixed(1)}%`} />
                    <MetricCard current={current.average_booking_value} label="Average paid booking" previous={comparison?.average_booking_value} value={<Currency currency={current.revenue_currency ?? 'NGN'} value={current.average_booking_value ?? 0} />} />
                </div>

                <Card className="overflow-hidden" padding={false}>
                    <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="text-base font-bold text-slate-950">Performance trend</h2>
                            <p className="mt-1 text-sm text-slate-500">Daily {trendMetrics[trendMetric].toLowerCase()} for {formatRange(current.range)}.</p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:justify-end">
                            <div className="flex items-center gap-4">
                                <ChartLegendItem color={trendColors.current} label="Selected period" />
                                {comparison && <ChartLegendItem color={trendColors.comparison} dashed label="Comparison" />}
                            </div>
                            <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                                {Object.entries(trendMetrics).map(([key, label]) => (
                                    <button
                                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${trendMetric === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                                        key={key}
                                        onClick={() => setTrendMetric(key)}
                                        type="button"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    {hasTrendPoints ? (
                        <div className="h-[390px] w-full px-1 pb-5 pt-6 sm:px-4">
                            <ResponsiveContainer height="100%" width="100%">
                                <ComposedChart data={chartData} margin={{ top: 8, right: 18, left: 0, bottom: 8 }}>
                                    <defs>
                                        <linearGradient id="providerTrendGradient" x1="0" x2="0" y1="0" y2="1">
                                            <stop offset="0%" stopColor={trendColors.current} stopOpacity={0.28} />
                                            <stop offset="100%" stopColor={trendColors.current} stopOpacity={0.03} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid horizontal stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                                    <XAxis
                                        axisLine={false}
                                        dataKey="label"
                                        interval="preserveStartEnd"
                                        minTickGap={34}
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickLine={false}
                                        tickMargin={12}
                                    />
                                    <YAxis
                                        allowDecimals={false}
                                        axisLine={false}
                                        domain={[0, 'auto']}
                                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                                        tickLine={false}
                                        tickMargin={10}
                                        width={38}
                                    />
                                    <Tooltip
                                        content={<TrendTooltip metricLabel={trendMetrics[trendMetric]} showComparison={Boolean(comparison)} />}
                                        cursor={{ stroke: '#cbd5e1', strokeWidth: 1 }}
                                    />
                                    <Area dataKey="currentArea" dot={false} fill="url(#providerTrendGradient)" stroke="transparent" type="linear" />
                                    <Line
                                        activeDot={{ fill: '#fff', r: 7, stroke: trendColors.current, strokeWidth: 3 }}
                                        dataKey="current"
                                        dot={chartData.length <= 60 ? { fill: '#fff', r: 5, stroke: trendColors.current, strokeWidth: 2 } : false}
                                        isAnimationActive={false}
                                        stroke={trendColors.current}
                                        strokeWidth={2.5}
                                        type="linear"
                                    />
                                    {comparison && (
                                        <Line
                                            activeDot={{ fill: '#fff', r: 7, stroke: trendColors.comparison, strokeWidth: 3 }}
                                            connectNulls
                                            dataKey="comparison"
                                            dot={chartData.length <= 60 ? { fill: '#fff', r: 5, stroke: trendColors.comparison, strokeWidth: 2 } : false}
                                            isAnimationActive={false}
                                            stroke={trendColors.comparison}
                                            strokeDasharray="5 5"
                                            strokeWidth={2.5}
                                            type="linear"
                                        />
                                    )}
                                </ComposedChart>
                            </ResponsiveContainer>
                            {comparison && (
                                <p className="mt-1 text-center text-[11px] text-slate-400">The comparison line is aligned by progress through each selected date range.</p>
                            )}
                        </div>
                    ) : <div className="p-6"><EmptyState description="Apply another date range to load its daily trend." icon="analytics" title="No trend data available" /></div>}
                </Card>

                {comparison && (
                    <Card>
                        <CardHeader description={`${formatRange(current.range)} compared with ${formatRange(comparison.range)}.`} title="Period comparison" />
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[620px] text-left text-sm">
                                <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400"><th className="pb-3">Metric</th><th className="pb-3">Selected period</th><th className="pb-3">Comparison period</th><th className="pb-3 text-right">Change</th></tr></thead>
                                <tbody>{[
                                    ['Profile views', current.profile_view_count, comparison.profile_view_count, false],
                                    ['Booking requests', current.booking_count, comparison.booking_count, false],
                                    ['Conversion rate', current.conversion_rate, comparison.conversion_rate, true],
                                    ['Unique customers', current.unique_customers, comparison.unique_customers, false],
                                    ['Retention rate', current.customer_retention_rate, comparison.customer_retention_rate, true],
                                ].map(([label, value, previous, points]) => {
                                    const change = changeLabel(value, previous, points);
                                    return <tr className="border-b border-slate-50 last:border-0" key={label}><td className="py-3 font-semibold text-slate-700">{label}</td><td className="py-3 font-bold text-slate-950">{points ? `${Number(value).toFixed(1)}%` : Number(value).toLocaleString()}</td><td className="py-3 text-slate-500">{points ? `${Number(previous).toFixed(1)}%` : Number(previous).toLocaleString()}</td><td className={`py-3 text-right font-black ${change.positive ? 'text-emerald-700' : change.negative ? 'text-rose-700' : 'text-slate-500'}`}>{change.label}</td></tr>;
                                })}</tbody>
                            </table>
                        </div>
                    </Card>
                )}

                <div className="grid gap-5 xl:grid-cols-2">
                    <Card>
                        <CardHeader description="Services ranked by requests in this period." title="Top services" />
                        {services.length ? <div className="space-y-4">{services.slice(0, 8).map((service) => {
                            const count = Number(service.bookings_count ?? 0);
                            const name = service.service?.name ?? service.name ?? 'Service';
                            return <div key={service.service_id ?? service.id ?? name}><div className="mb-1.5 flex justify-between gap-3 text-sm"><span className="truncate font-semibold text-slate-700">{name}</span><span className="font-bold text-slate-900">{count}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${Math.max(3, (count / maxBookings) * 100)}%` }} /></div></div>;
                        })}</div> : <EmptyState description="No services were booked in this range." icon="booking" title="No service data" />}
                    </Card>

                    <Card>
                        <CardHeader description="How booking requests ended during this period." title="Booking status" />
                        {statuses.length ? <div className="space-y-3">{statuses.map(([status, total]) => {
                            const percentage = current.booking_count ? (Number(total) / Number(current.booking_count)) * 100 : 0;
                            return <div key={status}><div className="mb-1.5 flex justify-between text-sm"><span className="font-semibold capitalize text-slate-700">{status.replaceAll('_', ' ')}</span><span className="font-bold text-slate-950">{total} <span className="font-medium text-slate-400">({percentage.toFixed(0)}%)</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${statusColors[status] ?? 'bg-slate-500'}`} style={{ width: `${percentage}%` }} /></div></div>;
                        })}</div> : <EmptyState description="No booking statuses are available for this range." icon="booking" title="No bookings" />}
                    </Card>

                </div>
            </>}
        </div>
    );
}
