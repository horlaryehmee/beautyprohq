import { useState } from 'react';
import { Button, Card, CardHeader, ErrorState, LoadingBlock, apiErrorMessage, apiRequest, useApiResource, useDashboardToast } from './index';

export default function BeautypreneurhubImportCard() {
    const resource = useApiResource('/admin/settings/beautypreneurhub-import', {});
    const { notify } = useDashboardToast();
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const importData = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const body = new FormData();
            body.append('package', file);
            const result = await apiRequest('post', '/admin/settings/beautypreneurhub-import', body, { headers: { 'Content-Type': 'multipart/form-data' } });
            resource.setData(result);
            notify(`Migration complete: ${result.result.created} providers added, ${result.result.preserved} existing listings preserved.`);
        } catch (requestError) {
            setError(apiErrorMessage(requestError));
            resource.reload();
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <CardHeader title="Beautypreneurhub migration" description="Bring the existing Beautypreneurhub listings and images into this platform." />
            {resource.loading ? <LoadingBlock rows={2} /> : resource.error ? <ErrorState message={resource.error} onRetry={resource.reload} /> : resource.data?.completed ? (
                <p className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">Migration completed. {resource.data.result?.total} listings processed. Owners can use Claim a listing to set their password and open their provider dashboard.</p>
            ) : (
                <form onSubmit={importData} className="mt-4 space-y-4">
                    <p className="text-sm leading-6 text-slate-600">Upload the prepared Beautypreneurhub migration file. Existing listings and accounts are preserved. Imported owners can claim their listing and use the same provider features and subscription options as other providers.</p>
                    <label className="block text-sm font-semibold text-slate-700">Migration file (.zip)
                        <input required type="file" accept=".zip,application/zip" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full rounded-xl border border-slate-200 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2" />
                    </label>
                    {error && <p className="text-sm text-rose-700" role="alert">{error}</p>}
                    <div className="flex justify-end"><Button type="submit" busy={busy} disabled={!file || busy}>Import Beautypreneurhub data</Button></div>
                    <p className="text-xs text-slate-500">This import is available once. The button disappears only after successful completion.</p>
                </form>
            )}
        </Card>
    );
}
