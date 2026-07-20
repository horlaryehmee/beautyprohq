import { Link } from 'react-router-dom';
import { Avatar, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, apiErrorMessage, apiRequest, useApiResource, useAsyncAction, useDashboardToast } from '../../components/dashboard';
import { providerIdentity } from '../../lib/utils';

const normalize = (value) => Array.isArray(value) ? value : value?.saved_providers ?? value?.data ?? [];

export default function CustomerSavedProvidersPage() {
    const resource = useApiResource('/customer/saved-providers', []);
    const { run, isBusy } = useAsyncAction();
    const { notify } = useDashboardToast();
    const providers = normalize(resource.data);

    const remove = (item) => run(item.id, async () => {
        const provider = item.provider ?? item;
        try {
            await apiRequest('delete', `/customer/saved-providers/${provider.id}`);
            resource.setData((current) => normalize(current).filter((saved) => saved.id !== item.id));
            notify('Provider removed from saved list.');
        } catch (error) {
            notify(apiErrorMessage(error), 'error');
        }
    });

    return (
        <div className="space-y-6">
            <PageHeader actions={<Link to="/directory"><Button>Explore directory</Button></Link>} description="Keep your favourite professionals close for quick rebooking." eyebrow="Favourites" title="Saved providers" />
            {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
            <Card>
                {resource.loading ? <LoadingBlock rows={5} /> : providers.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {providers.map((item) => {
                            const provider = item.provider ?? item;
                            const user = provider.user ?? provider;
                            const pro = providerIdentity(provider);
                            const rating = Number(provider.rating ?? 0);

                            return (
                                <article className="rounded-2xl border border-slate-100 p-4" key={item.id}>
                                    <div className="flex items-center gap-3">
                                        <Avatar name={user.name} size="lg" src={provider.profile_photo} />
                                        <div className="min-w-0">
                                            <p className="truncate font-bold text-slate-950">{user.name}</p>
                                            <p className="truncate text-sm text-slate-500">{provider.profession}</p>
                                            <p className="mt-1 truncate text-xs text-slate-400">{pro.cardLocation}{rating > 0 ? ` · ★ ${rating.toFixed(1)}` : ''}</p>
                                        </div>
                                    </div>
                                    <div className="mt-5 flex gap-2">
                                        <Link className="flex-1" to={`/providers/${provider.slug ?? provider.id}`}><Button className="w-full">View & book</Button></Link>
                                        <Button busy={isBusy(item.id)} onClick={() => remove(item)} type="button" variant="danger">Remove</Button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                ) : <EmptyState action={<Link to="/directory"><Button variant="soft">Browse professionals</Button></Link>} description="Save providers from the directory and they will appear here." icon="saved" title="No saved providers" />}
            </Card>
        </div>
    );
}
