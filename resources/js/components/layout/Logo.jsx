import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function Logo({ light = false, className }) {
    return (
        <Link to="/" className={cn('inline-flex items-center gap-2.5', className)} aria-label="BeautyPro HQ home">
            <span className={cn('grid size-10 place-items-center rounded-[14px] font-display text-lg font-normal shadow-sm', light ? 'bg-white text-plum-900' : 'bg-plum-900 text-white')}>
                B
            </span>
            <span className={cn('font-display text-lg font-black tracking-[-.02em]', light ? 'text-white' : 'text-plum-950')}>
                BeautyPro <span className={light ? 'text-rose-200' : 'text-rose-600'}>HQ</span>
            </span>
        </Link>
    );
}
