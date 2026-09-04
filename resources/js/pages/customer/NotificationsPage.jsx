import { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, Pagination, apiErrorMessage, apiRequest, formatDate, useApiResource, useAsyncAction, useDashboardToast } from '../../components/dashboard';

const normalize = (value) => Array.isArray(value) ? value : value?.notifications ?? value?.data ?? [];
const withItems = (current, items) => Array.isArray(current) ? items : { ...current, data: items };

export default function CustomerNotificationsPage() {
    const [page, setPage] = useState(1);
    const resource = useApiResource('/notifications', [], { params: { page, per_page: 20 } });
    const { role = 'customer' } = useOutletContext() ?? {};
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();
    const navigate = useNavigate();
    const notifications = normalize(resource.data);
    const meta = resource.data?.meta ?? {};

    const followAction = (actionUrl) => {
        if (!actionUrl) return;

        const target = new URL(actionUrl, window.location.origin);
        if (target.origin === window.location.origin) {
            navigate(`${target.pathname}${target.search}${target.hash}`);
        } else {
            window.location.assign(target.toString());
        }
    };

    const openNotification = (notification) => run(notification.id, async () => {
        const content = notification.data ?? notification;
        try {
            if (!notification.read_at) {
                await apiRequest('patch', `/notifications/${notification.id}/read`);
                resource.setData((current) => withItems(current, normalize(current).map((item) => item.id === notification.id
                    ? { ...item, read_at: new Date().toISOString() }
                    : item)));
                window.dispatchEvent(new CustomEvent('bphq:notifications-changed'));
            }
            followAction(content.action_url);
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    const markAll = async () => {
        try {
            await apiRequest('post', '/notifications/read-all');
            resource.setData((current) => withItems(current, normalize(current).map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() }))));
            window.dispatchEvent(new CustomEvent('bphq:notifications-changed'));
            notify('All notifications marked as read.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    const clearAll = async () => {
        if (!window.confirm('Clear all notifications? This cannot be undone.')) return;

        try {
            await apiRequest('delete', '/notifications');
            resource.setData((current) => withItems(current, []));
            window.dispatchEvent(new CustomEvent('bphq:notifications-changed'));
            notify('Notifications cleared.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={notifications.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {notifications.some((item) => !item.read_at) && <Button onClick={markAll} type="button" variant="secondary">Mark all read</Button>}
                        <Button onClick={clearAll} type="button" variant="secondary">Clear all</Button>
                    </div>
                )}
                description={role === 'provider'
                    ? 'Announcements, bookings, reviews, profile enquiries and account activity appear here.'
                    : 'Announcements, booking updates, reminders and reward activity appear here.'}
                eyebrow="Updates"
                title="Notifications"
            />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            <Card>
                {resource.loading ? <LoadingBlock rows={6} /> : notifications.length ? (
                    <>
                        <div className="divide-y divide-slate-100">
                            {notifications.map((notification) => {
                                const content = notification.data ?? notification;
                                const unread = !notification.read_at;
                                return (
                                    <button
                                        className={`flex w-full gap-4 py-4 text-left first:pt-0 last:pb-0 ${unread ? '' : 'opacity-60'}`}
                                        disabled={isBusy(notification.id)}
                                        key={notification.id}
                                        onClick={() => openNotification(notification)}
                                        type="button"
                                    >
                                        <span className={`mt-2 size-2 shrink-0 rounded-full ${unread ? 'bg-fuchsia-500' : 'bg-slate-200'}`} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-3">
                                                <p className="text-sm font-bold text-slate-900">{content.title ?? 'BeautyPro update'}</p>
                                                <span className="shrink-0 text-[11px] text-slate-400">{formatDate(notification.created_at, { year: undefined })}</span>
                                            </div>
                                            <p className="mt-1 text-sm leading-6 text-slate-500">{content.message ?? content.body}</p>
                                        </div>
                                        {unread && <span className="shrink-0 rounded-full bg-fuchsia-50 px-2 py-1 text-[10px] font-bold text-fuchsia-700">New</span>}
                                    </button>
                                );
                            })}
                        </div>
                        <Pagination page={Number(meta.current_page ?? page)} pageCount={Number(meta.last_page ?? 1)} onPageChange={setPage} />
                    </>
                ) : (
                    <EmptyState description="You’re up to date. New activity will appear here." icon="bell" title="No notifications" />
                )}
            </Card>
        </div>
    );
}
