import { cn } from '../../lib/utils';

export default function SectionHeading({ eyebrow, title, description, action, align = 'left', light = false, className }) {
    return (
        <div className={cn('mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between', align === 'center' && 'mx-auto max-w-3xl text-center sm:block', className)}>
            <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
                {eyebrow && <p className={cn('mb-2 text-xs font-black uppercase tracking-[0.19em]', light ? 'text-rose-200' : 'text-rose-600')}>{eyebrow}</p>}
                <h2 className={cn('font-display text-3xl font-black leading-tight sm:text-4xl', light ? 'text-white' : 'text-plum-950')}>{title}</h2>
                {description && <p className={cn('mt-3 text-sm leading-7 sm:text-base', light ? 'text-plum-100' : 'text-stone-600')}>{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}
