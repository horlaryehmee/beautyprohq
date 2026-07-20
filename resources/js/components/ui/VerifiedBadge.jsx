import { cn } from '../../lib/utils';

export default function VerifiedBadge({ show = true, size = 'md', className = '' }) {
    if (!show) return null;

    const sizes = {
        sm: 'size-4',
        md: 'size-5',
        lg: 'size-7',
    };

    return (
        <span className={cn('inline-grid place-items-center text-[#1d9bf0]', sizes[size] ?? sizes.md, className)} title="Verified">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-full" fill="currentColor">
                <path d="M12 1.75 14.08 3.8l2.88-.45 1.04 2.72 2.72 1.04-.45 2.88L22.25 12l-1.98 2.01.45 2.88-2.72 1.04-1.04 2.72-2.88-.45L12 22.25 9.92 20.2l-2.88.45L6 17.93l-2.72-1.04.45-2.88L1.75 12l1.98-2.01-.45-2.88L6 6.07l1.04-2.72 2.88.45L12 1.75Z" />
                <path d="m9.85 13.75-2.1-2.1-1.35 1.36 3.45 3.45 7.75-7.75-1.35-1.36-6.4 6.4Z" fill="white" />
            </svg>
        </span>
    );
}
