import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, IconButton, LoadingBlock, PageHeader, Pagination, apiErrorMessage, cx, formatDate, useDashboardToast } from '../../components/dashboard';
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

function absoluteUrl(value) {
    if (!value) return '';
    try {
        return new URL(value, window.location.origin).href;
    } catch {
        return String(value);
    }
}

function mediaDate(item) {
    return formatDate((item.last_modified ?? Date.now() / 1000) * 1000);
}

const emptyMeta = {
    current_page: 1,
    last_page: 1,
    per_page: 12,
    total: 0,
};

export default function AdminMediaPage() {
    const { notify } = useDashboardToast();
    const [items, setItems] = useState([]);
    const [meta, setMeta] = useState(emptyMeta);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [deletingPath, setDeletingPath] = useState('');
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [selectedPaths, setSelectedPaths] = useState(() => new Set());
    const [previewUrl, setPreviewUrl] = useState('');
    const [uploaded, setUploaded] = useState(null);

    const loadMedia = useCallback(async (nextPage = page) => {
        setLoading(true);
        setError('');
        try {
            const response = await dashboardApi.get('/admin/media', {
                params: { page: nextPage, per_page: 12 },
            });
            const payload = unwrap(response);
            setItems(payload?.data ?? []);
            setMeta(payload?.meta ?? emptyMeta);
            setPage(payload?.meta?.current_page ?? nextPage);
            setSelectedPaths(new Set());
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Could not load media.'));
        } finally {
            setLoading(false);
        }
    }, [page]);

    useEffect(() => {
        loadMedia(1);
    }, []);

    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

    const preview = useMemo(() => uploaded ?? (selectedFile ? {
        name: selectedFile.name,
        type: selectedFile.type,
        size: selectedFile.size,
        url: previewUrl,
    } : null), [previewUrl, selectedFile, uploaded]);

    const selectedCount = selectedPaths.size;
    const allVisibleSelected = items.length > 0 && items.every((item) => selectedPaths.has(item.path));

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

            setUploaded(unwrap(response));
            setSelectedFile(null);
            setPreviewUrl('');
            await loadMedia(1);
            notify('File uploaded and optimized.', 'success');
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Upload failed.'));
        } finally {
            setUploading(false);
        }
    };

    const copyUrl = async (item) => {
        const url = absoluteUrl(item.url);
        if (!url) return;

        try {
            await navigator.clipboard.writeText(url);
            notify('Media URL copied.', 'success');
        } catch {
            window.prompt('Copy media URL', url);
        }
    };

    const deleteMedia = async (item) => {
        if (!item?.path) return;
        if (!window.confirm(`Delete ${item.name ?? item.filename ?? 'this file'}? This cannot be undone.`)) return;

        setDeletingPath(item.path);
        setError('');
        try {
            await dashboardApi.delete('/admin/media', { data: { path: item.path } });
            notify('Media file deleted.', 'success');
            const nextPage = items.length === 1 && page > 1 ? page - 1 : page;
            await loadMedia(nextPage);
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Could not delete media file.'));
        } finally {
            setDeletingPath('');
        }
    };

    const deleteSelected = async () => {
        const paths = Array.from(selectedPaths);
        if (paths.length === 0) return;
        if (!window.confirm(`Delete ${paths.length} selected media ${paths.length === 1 ? 'file' : 'files'}? This cannot be undone.`)) return;

        setError('');
        try {
            for (const path of paths) {
                setDeletingPath(path);
                await dashboardApi.delete('/admin/media', { data: { path } });
            }
            notify(`${paths.length} media ${paths.length === 1 ? 'file' : 'files'} deleted.`, 'success');
            await loadMedia(page);
        } catch (requestError) {
            setError(apiErrorMessage(requestError, 'Could not delete the selected media files.'));
        } finally {
            setDeletingPath('');
        }
    };

    const togglePath = (path) => {
        setSelectedPaths((current) => {
            const next = new Set(current);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    const toggleVisible = () => {
        setSelectedPaths((current) => {
            const next = new Set(current);
            if (allVisibleSelected) {
                items.forEach((item) => next.delete(item.path));
            } else {
                items.forEach((item) => next.add(item.path));
            }
            return next;
        });
    };

    return (
        <div className="space-y-6">
            <PageHeader
                actions={<Button onClick={() => loadMedia(page)} type="button" variant="secondary">Refresh</Button>}
                description="Upload, review, copy, download, and delete files stored in the media library."
                eyebrow="Admin"
                title="Media library"
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_1fr]">
                <Card>
                    <h2 className="text-lg font-bold text-slate-950">Upload file</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-500">JPG, PNG, WEBP, or PDF. Maximum file size is 2MB.</p>

                    <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                        {preview && isImage(preview) && preview.url ? (
                            <img alt="" className="aspect-[16/10] w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={preview.url} />
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
                            <a className="mt-1 block break-all text-emerald-700 underline" href={uploaded.url} rel="noreferrer" target="_blank">{absoluteUrl(uploaded.url)}</a>
                        </div>
                    )}
                </Card>

                <Card>
                    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">Uploaded files</h2>
                            <p className="mt-1 text-sm text-slate-500">{meta.total} files in storage/app/public/uploads</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {selectedCount > 0 && (
                                <Button busy={Boolean(deletingPath)} onClick={deleteSelected} type="button" variant="danger">
                                    Delete selected ({selectedCount})
                                </Button>
                            )}
                        </div>
                    </div>

                    {loading ? <LoadingBlock rows={6} /> : error ? <ErrorState message={error} onRetry={() => loadMedia(page)} /> : items.length === 0 ? (
                        <EmptyState title="No media uploaded yet" description="Uploaded files will appear here." />
                    ) : (
                        <>
                            <div className="overflow-hidden rounded-2xl border border-slate-200">
                                <div className="hidden grid-cols-[40px_64px_minmax(220px,1fr)_120px_120px_180px] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 lg:grid">
                                    <label className="grid place-items-center">
                                        <span className="sr-only">Select all files on this page</span>
                                        <input checked={allVisibleSelected} className="size-4 rounded border-slate-300" onChange={toggleVisible} type="checkbox" />
                                    </label>
                                    <span>File</span>
                                    <span>Name</span>
                                    <span>Type</span>
                                    <span>Date</span>
                                    <span className="text-right">Actions</span>
                                </div>

                                <div className="divide-y divide-slate-100">
                                    {items.map((item) => {
                                        const url = absoluteUrl(item.url);
                                        const name = item.name ?? item.filename ?? item.path;
                                        const checked = selectedPaths.has(item.path);
                                        const image = isImage(item);
                                        const deleting = deletingPath === item.path;

                                        return (
                                            <div className={cx('grid gap-3 px-4 py-3 transition hover:bg-slate-50 lg:grid-cols-[40px_64px_minmax(220px,1fr)_120px_120px_180px] lg:items-center', checked && 'bg-fuchsia-50/50')} key={item.path}>
                                                <label className="absolute mt-1 grid place-items-center lg:static">
                                                    <span className="sr-only">Select {name}</span>
                                                    <input checked={checked} className="size-4 rounded border-slate-300" onChange={() => togglePath(item.path)} type="checkbox" />
                                                </label>

                                                <a className="ml-8 block size-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 lg:ml-0" href={url} rel="noreferrer" target="_blank">
                                                    {image ? (
                                                        <img alt="" className="size-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={url} />
                                                    ) : (
                                                        <span className="grid size-full place-items-center text-xs font-bold uppercase text-slate-500">PDF</span>
                                                    )}
                                                </a>

                                                <div className="min-w-0">
                                                    <a className="block truncate text-sm font-bold text-blue-700 hover:underline" href={url} rel="noreferrer" target="_blank">{name}</a>
                                                    <p className="mt-1 truncate text-xs text-slate-600">{item.filename ?? name}</p>
                                                    <p className="mt-1 truncate text-xs text-slate-400">{item.path}</p>
                                                </div>

                                                <div className="text-sm text-slate-600">
                                                    <span className="font-semibold lg:hidden">Type: </span>{image ? 'Image' : 'Document'}
                                                    <p className="mt-1 text-xs text-slate-400">{formatBytes(item.size)}</p>
                                                </div>

                                                <div className="text-sm text-slate-600">
                                                    <span className="font-semibold lg:hidden">Date: </span>{mediaDate(item)}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                                    <IconButton icon="eye" label="View media" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} />
                                                    <IconButton icon="copy" label="Copy URL" onClick={() => copyUrl(item)} />
                                                    <a className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950" download={name} href={url} title="Download media">
                                                        <span className="sr-only">Download media</span>
                                                        <svg aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                                                    </a>
                                                    <IconButton className="text-rose-600 hover:text-rose-700" disabled={deleting} icon="trash" label="Delete media" onClick={() => deleteMedia(item)} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <Pagination page={meta.current_page} pageCount={meta.last_page} onPageChange={(nextPage) => loadMedia(nextPage)} />
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}
