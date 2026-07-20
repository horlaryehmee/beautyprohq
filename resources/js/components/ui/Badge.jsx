import Icon from './Icon';
import { cn } from '../../lib/utils';

export default function Badge({ children, tone = 'neutral', icon, className }) {
    const tones = {
        neutral: 'bg-stone-100 text-stone-700',
        rose: 'bg-rose-50 text-rose-700',
        plum: 'bg-plum-50 text-plum-800',
        success: 'bg-emerald-50 text-emerald-700',
        warning: 'bg-amber-50 text-amber-800',
    };
    return (
        <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold tracking-wide', tones[tone], className)}>
            {icon && <Icon name={icon} size={13} />}
            {children}
        </span>
    );
}
