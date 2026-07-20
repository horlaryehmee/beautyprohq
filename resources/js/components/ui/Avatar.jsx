import { useState } from 'react';
import { cn, initials } from '../../lib/utils';

export default function Avatar({ src, name, size = 'md', className }) {
    const [failed, setFailed] = useState(false);
    const sizes = { sm: 'size-10 text-xs', md: 'size-14 text-sm', lg: 'size-24 text-xl', xl: 'size-32 text-2xl sm:size-36' };

    return (
        <span className={cn('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-rose-100 to-plum-100 font-black text-plum-800', sizes[size], className)}>
            {src && !failed ? (
                <img src={src} alt={name || 'Profile'} className="size-full object-cover" onError={() => setFailed(true)} />
            ) : initials(name)}
        </span>
    );
}
