import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function Logo({ light = false, className, imageClassName }) {
    const brand = window.__BPHQ_BRAND__ ?? {};
    const logoUrl = brand.logo_url || '/brand/bphq-logo-transparent.svg';
    const siteName = brand.site_name || 'BeautyPro HQ';

    return (
        <Link to="/" className={cn('inline-flex items-center leading-none', className)} aria-label={`${siteName} home`}>
            <img
                src={logoUrl}
                alt={siteName}
                className={cn('h-24 w-auto object-contain sm:h-28', light && 'brightness-0 invert', imageClassName)}
            />
        </Link>
    );
}
