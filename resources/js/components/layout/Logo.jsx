import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

export default function Logo({ light = false, className, imageClassName }) {
    const brand = window.__BPHQ_BRAND__ ?? {};
    const logoUrl = brand.logo_url || '/brand/bphq-logo-transparent.svg';
    const displayLogoUrl = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(logoUrl)
        ? '/brand/bphq-logo-transparent.svg'
        : logoUrl;
    const siteName = brand.site_name || 'BeautyPro HQ';

    return (
        <Link to="/" className={cn('inline-flex items-center leading-none', className)} aria-label={`${siteName} home`}>
            <img
                src={displayLogoUrl}
                alt={siteName}
                width="168"
                height="168"
                className={cn('h-24 w-auto object-contain sm:h-28', light && 'brightness-0 invert', imageClassName)}
            />
        </Link>
    );
}
