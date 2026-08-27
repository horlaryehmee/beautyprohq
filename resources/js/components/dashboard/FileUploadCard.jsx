import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, File as FileIcon, Image as ImageIcon, Trash2, UploadCloud, X } from 'lucide-react';
import { cx } from './ui';

function formatFileSize(bytes) {
    const size = Number(bytes ?? 0);
    if (!size) return '0 KB';
    const units = ['Bytes', 'KB', 'MB', 'GB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
    return `${Number((size / (1024 ** index)).toFixed(index === 0 ? 0 : 1))} ${units[index]}`;
}

function fileKind(file) {
    const type = String(file?.type ?? '');
    const name = String(file?.name ?? '');
    if (type.startsWith('image/')) return 'IMG';
    const extension = name.includes('.') ? name.split('.').pop() : '';
    return extension ? extension.slice(0, 4).toUpperCase() : 'FILE';
}

export default function FileUploadCard({
    title = 'Upload files',
    description = 'Select and upload the files of your choice',
    helper = 'JPG, PNG, WEBP, PDF, DOC and DOCX up to 12 MB.',
    accept,
    multiple = false,
    files = [],
    disabled = false,
    browseLabel = 'Browse file',
    onFilesSelected,
    onFileRemove,
    className = '',
}) {
    const inputRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    const chooseFiles = (selectedFiles) => {
        const nextFiles = Array.from(selectedFiles ?? []);
        if (nextFiles.length) onFilesSelected?.(nextFiles);
    };

    const handleDrop = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (!disabled) chooseFiles(event.dataTransfer.files);
    };

    return (
        <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cx('overflow-hidden rounded-2xl border border-bphq-chrome bg-white shadow-sm', className)}
            initial={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
        >
            <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bphq-ivory text-bphq-coffee">
                        <UploadCloud className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-bphq-espresso">{title}</h3>
                        <p className="mt-1 text-xs font-semibold leading-5 text-bphq-coffee">{description}</p>
                    </div>
                </div>

                <button
                    className={cx(
                        'mt-5 flex min-h-48 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition',
                        dragging ? 'border-bphq-coffee bg-bphq-ivory' : 'border-bphq-chrome bg-white hover:border-bphq-coffee/70 hover:bg-bphq-ivory/50',
                        disabled && 'cursor-not-allowed opacity-60',
                    )}
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                    onDragEnter={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!disabled) setDragging(true);
                    }}
                    onDragLeave={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDragging(false);
                    }}
                    onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                    }}
                    onDrop={handleDrop}
                    type="button"
                >
                    <input
                        accept={accept}
                        className="hidden"
                        disabled={disabled}
                        multiple={multiple}
                        onChange={(event) => {
                            chooseFiles(event.target.files);
                            event.target.value = '';
                        }}
                        ref={inputRef}
                        type="file"
                    />
                    <UploadCloud className="mb-3 size-9 text-bphq-coffee" />
                    <span className="text-sm font-black text-bphq-espresso">Choose a file or drag and drop it here.</span>
                    <span className="mt-1 text-xs font-semibold leading-5 text-bphq-coffee">{helper}</span>
                    <span className="mt-4 inline-flex min-h-9 items-center justify-center rounded-xl border border-bphq-chrome bg-white px-4 text-xs font-black text-bphq-espresso shadow-sm">
                        {browseLabel}
                    </span>
                </button>
            </div>

            {files.length > 0 && (
                <div className="border-t border-bphq-chrome/70 p-4 sm:p-5">
                    <ul className="space-y-3">
                        <AnimatePresence initial={false}>
                            {files.map((file) => {
                                const Icon = String(file.type ?? '').startsWith('image/') ? ImageIcon : FileIcon;
                                const progress = Math.max(0, Math.min(100, Number(file.progress ?? 0)));
                                return (
                                    <motion.li
                                        animate={{ opacity: 1, x: 0 }}
                                        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
                                        exit={{ opacity: 0, x: -12 }}
                                        initial={{ opacity: 0, x: -12 }}
                                        key={file.id}
                                        layout
                                    >
                                        <span className="grid size-10 place-items-center rounded-lg bg-bphq-ivory text-[10px] font-black text-bphq-coffee">
                                            <Icon className="size-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-bphq-espresso">{file.name}</p>
                                            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs font-semibold text-bphq-coffee">
                                                <span>{file.status === 'uploading' ? `${formatFileSize((file.size * progress) / 100)} of ` : ''}{formatFileSize(file.size)}</span>
                                                <span aria-hidden="true">.</span>
                                                <span className={cx(
                                                    file.status === 'completed' && 'text-emerald-700',
                                                    file.status === 'error' && 'text-rose-700',
                                                    file.status === 'uploading' && 'text-bphq-coffee',
                                                )}>
                                                    {file.status === 'uploading' ? 'Uploading...' : file.status === 'error' ? (file.error ?? 'Upload failed') : 'Completed'}
                                                </span>
                                                <span aria-hidden="true">.</span>
                                                <span>{fileKind(file)}</span>
                                            </div>
                                            {file.status === 'uploading' && (
                                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bphq-ivory">
                                                    <span className="block h-full rounded-full bg-bphq-coffee transition-all" style={{ width: `${progress}%` }} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {file.status === 'completed' && <CheckCircle2 className="size-5 text-emerald-600" />}
                                            {file.status === 'error' && <AlertCircle className="size-5 text-rose-600" />}
                                            <button
                                                aria-label={`Remove ${file.name}`}
                                                className="grid size-8 place-items-center rounded-full text-bphq-coffee transition hover:bg-bphq-ivory hover:text-bphq-espresso"
                                                onClick={() => onFileRemove?.(file.id)}
                                                type="button"
                                            >
                                                {file.status === 'completed' ? <Trash2 className="size-4" /> : <X className="size-4" />}
                                            </button>
                                        </div>
                                    </motion.li>
                                );
                            })}
                        </AnimatePresence>
                    </ul>
                </div>
            )}
        </motion.div>
    );
}
