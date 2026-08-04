import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, apiErrorMessage, cx, formatDate, useDashboardToast } from '../../components/dashboard';
import { dashboardApi, unwrap } from '../../components/dashboard/api';

const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

function formatBytes(value) {
    const size = Number(value ?? 0);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    const units = ['B', 'KB', 'MB'];
    const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    return `${(size / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function isImage(file) {
    return String(file?.mime_type ?? file?.type ?? '').startsWith('image/');
}

export default function AdminMediaPage() {
    const { notify } = useDashboardToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploaded, setUploaded] = useState(null);

    const loadMedia = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const response = await dashboardApi.get('/admin/media');
            setItems(unwrap(response) ?? []);
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Could not load media.'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMedia();
    }, [loadMedia]);

    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    const preview = useMemo(() => uploaded ?? (selectedFile ? {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
        url: previewUrl,
    } : null), [previewUrl, selectedFile, uploaded]);

    const chooseFile = (event) => {
        const file = event.target.files?.[0] ?? null;
        setUploaded(null);
        setSelectedFile(file);
        setProgress(0);
        setError('');

        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : '');
    };

    const upload = async () => {
        if (!selectedFile) {
            setError('Choose a file before uploading.');
            return;
        }

        if (!acceptedTypes.includes(selectedFile.type)) {
            setError('Upload a JPG, PNG, WEBP, or PDF file.');
            return;
        }

        setUploading(true);
        setProgress(0);
        setError('');

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await dashboardApi.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (event) => {
                    if (!event.total) return;
                    setProgress(Math.round((event.loaded * 100) / event.total));
                },
            });

            const payload = unwrap(response);
            setUploaded(payload);
            setSelectedFile(null);
            setPreviewUrl('');
            setItems((current) => [payload, ...current]);
            notify('File uploaded and optimized.', 'success');
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Upload failed.'));
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Admin"
                title="Media library"
                description="Upload images and documents. Images are resized to 1200px wide, compressed, and converted to WebP when the server supports it."
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
                <Card>
                    <h2 className="text-lg font-bold text-slate-950">Upload file</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">JPG, PNG, WEBP, or PDF. Maximum file size is 2MB.</p>

                    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {preview && isImage(preview) && preview.url ? (
                            <img alt="" className="aspect-[16/10] w-full object-cover" src={preview.url} />
                        ) : (
                            <div className="grid aspect-[16/10] place-items-center px-5 text-center">
                                <div>
                                    <p className="text-sm font-bold text-slate-700">{preview?.name ?? 'No file selected'}</p>
                                    {preview?.size ? <p className="mt-1 text-xs text-slate-500">{formatBytes(preview.size)}</p> : null}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="mt-5 space-y-3">
                        <label className="block">
                            <span className="sr-only">Choose file</span>
                            <input
                                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                                className="block w-full cursor-pointer rounded-xl border border-slate-200 bg-white text-sm text-slate-600 file:mr-4 file:min-h-10 file:border-0 file:bg-slate-950 file:px-4 file:text-sm file:font-bold file:text-white"
                                disabled={uploading}
                                onChange={chooseFile}
                                type="file"
                            />
                        </label>

                        {uploading && (
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-fuchsia-600 transition-all" style={{ width: `${progress}%` }} />
                            </div>
                        )}

                        {error && <ErrorState message={error} />}

                        <Button busy={uploading} className="w-full" disabled={!selectedFile} onClick={upload} type="button">
                            {uploading ? `Uploading ${progress}%` : 'Upload'}
                        </Button>
                    </div>

                    {uploaded && (
                        <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                            <p className="font-bold">Uploaded successfully</p>
                            <a className="mt-1 block break-all text-emerald-700 underline" href={uploaded.url} rel="noreferrer" target="_blank">{uploaded.url}</a>
                        </div>
                    )}
                </Card>

                <Card>
                    <div className="mb-5 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">Uploaded files</h2>
                            <p className="mt-1 text-sm text-slate-500">{items.length} files in storage/app/public/uploads</p>
                        </div>
                        <Button onClick={loadMedia} type="button" variant="secondary">Refresh</Button>
                    </div>

                    {loading ? <LoadingBlock rows={5} /> : error ? <ErrorState message={error} onRetry={loadMedia} /> : items.length === 0 ? (
                        <EmptyState title="No media uploaded yet" description="Uploaded files will appear here." />
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                            {items.map((item) => (
                                <a className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-fuchsia-200 hover:shadow-sm" href={item.url} key={item.path} rel="noreferrer" target="_blank">
                                    {isImage(item) ? (
                                        <img alt="" className="aspect-[4/3] w-full bg-slate-100 object-cover" src={item.url} />
                                    ) : (
                                        <div className="grid aspect-[4/3] place-items-center bg-slate-100 text-sm font-black uppercase tracking-[.16em] text-slate-400">PDF</div>
                                    )}
                                    <div className="space-y-1 p-4">
                                        <p className="truncate text-sm font-bold text-slate-900">{item.name ?? item.filename}</p>
                                        <p className="text-xs text-slate-500">{formatBytes(item.size)} · {formatDate((item.last_modified ?? Date.now() / 1000) * 1000)}</p>
                                        <p className={cx('truncate text-xs', isImage(item) ? 'text-fuchsia-700' : 'text-slate-500')}>{item.path}</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
