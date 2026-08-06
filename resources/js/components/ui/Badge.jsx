import Icon from './Icon';
import { cn } from '../../lib/utils';

export default function Badge({ children, tone = 'neutral', icon, className }) {
    const tones = {
        neutral: 'bg-bphq-ivory text-bphq-espresso',
        rose: 'bg-bphq-ivory text-bphq-coffee',
        plum: 'bg-bphq-ivory text-bphq-espresso',
        success: 'bg-bphq-ivory text-bphq-espresso',
        warning: 'bg-bphq-beige text-bphq-espresso',
    };
    return (
        <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-[1.4] tracking-wide', tones[tone], className)}>
            {icon && <Icon name={icon} size={13} />}
            {children}
        </span>
    );
}
