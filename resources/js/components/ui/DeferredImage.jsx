import { useEffect, useRef } from 'react';

export default function DeferredImage({ src, srcSet, sizes, loading = 'lazy', rootMargin = '250px', ...props }) {
    const imageRef = useRef(null);

    useEffect(() => {
        const image = imageRef.current;
        if (!image || !src) return undefined;

        const load = () => {
            if (sizes) image.sizes = sizes;
            if (srcSet) image.srcset = srcSet;
            image.src = src;
        };

        if (loading === 'eager' || !('IntersectionObserver' in window)) {
            load();
            return undefined;
        }

        const observer = new IntersectionObserver(([entry]) => {
            if (!entry.isIntersecting) return;
            load();
            observer.disconnect();
        }, { rootMargin });
        observer.observe(image);

        return () => observer.disconnect();
    }, [loading, rootMargin, sizes, src, srcSet]);

    return <img ref={imageRef} loading={loading} decoding="async" {...props} />;
}
