import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function Logo({ light = false, className, imageClassName }) {
    return (
        <Link to="/" className={cn('inline-flex items-center leading-none', className)} aria-label="BeautyPro HQ home">
            <img
                src="/brand/bphq-logo-transparent.svg"
                alt="BeautyPro HQ"
                className={cn('h-24 w-auto object-contain sm:h-28', light && 'brightness-0 invert', imageClassName)}
            />
        </Link>
    );
}
