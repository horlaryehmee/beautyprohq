import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ShuffleHero } from '../../components/ui/shuffle-grid';
import Seo from '../../components/Seo';
import NewsletterPopup from '../../components/public/NewsletterPopup';

const loadHomeContent = () => import('./HomePage');
const HomeContent = lazy(loadHomeContent);

export default function HomeLandingPage() {
    const suppressInitialHeroAnimation = useRef(Boolean(globalThis.__BPHQ_FIRST_PAINT__)).current;
    const [showContent, setShowContent] = useState(() => (
        window.matchMedia('(min-width: 768px)').matches || Boolean(window.location.hash)
    ));
    const [heroProviders, setHeroProviders] = useState(() => (
        Array.isArray(globalThis.__BPHQ_HERO_IMAGES__)
            ? globalThis.__BPHQ_HERO_IMAGES__.map((profilePhoto, index) => ({ id: `initial-${index}`, profile_photo: profilePhoto }))
            : []
    ));
    const contentBoundaryRef = useRef(null);
    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/home/hero-images', { cache: 'no-store', signal: controller.signal })
            .then((response) => { if (!response.ok) throw new Error('Could not load hero images.'); return response.json(); })
            .then(({ data }) => {
                if (data?.images?.length) setHeroProviders(data.images.map((profile_photo, index) => ({ id: `hero-${index}`, profile_photo })));
            }).catch(() => {});
        return () => controller.abort();
    }, []);

    useEffect(() => {
        delete globalThis.__BPHQ_FIRST_PAINT__;
    }, []);

    useEffect(() => {
        const desktopQuery = window.matchMedia('(min-width: 768px)');
        const boundary = contentBoundaryRef.current;
        const reveal = () => setShowContent(true);
        const revealOnDesktop = (event) => event.matches && reveal();
        const observer = !showContent && boundary && 'IntersectionObserver' in window
            ? new IntersectionObserver(([entry]) => entry.isIntersecting && reveal(), { rootMargin: '0px' })
            : null;

        observer?.observe(boundary);
        desktopQuery.addEventListener?.('change', revealOnDesktop);
        window.addEventListener('touchstart', reveal, { once: true, passive: true });
        window.addEventListener('wheel', reveal, { once: true, passive: true });

        return () => {
            observer?.disconnect();
            desktopQuery.removeEventListener?.('change', revealOnDesktop);
            window.removeEventListener('touchstart', reveal);
            window.removeEventListener('wheel', reveal);
        };
    }, [showContent]);

    return (
        <>
            <Seo
                title="The Beauty Service Ecosystem"
                description="Discover trusted beauty professionals, stay updated on industry news and events, and connect with opportunities across the beauty industry."
            />
            <ShuffleHero providers={heroProviders} animateCopy={!suppressInitialHeroAnimation} />
            <NewsletterPopup />
            <div ref={contentBoundaryRef} aria-hidden={!showContent || undefined}>
                {showContent ? (
                    <Suspense fallback={<div className="min-h-[900px] bg-white" aria-hidden="true" />}>
                        <HomeContent />
                    </Suspense>
                ) : (
                    <div className="min-h-[900px] bg-white" aria-hidden="true" />
                )}
            </div>
        </>
    );
}
