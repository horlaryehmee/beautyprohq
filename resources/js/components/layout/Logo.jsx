import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function Logo({ light = false, className }) {
    return (
        <Link to="/" className={cn('inline-flex flex-col items-center leading-none', className)} aria-label="BeautyPro HQ home">
            <span className={cn('font-display text-[2.15rem] font-normal tracking-[-.08em]', light ? 'text-white' : 'text-[#26211e]')}>
                BPHQ
            </span>
            <span className={cn('mt-1 text-[10px] font-black uppercase tracking-[.42em]', light ? 'text-rose-100' : 'text-stone-500')}>
                BEAUTYPROHQ
            </span>
        </Link>
    );
}
