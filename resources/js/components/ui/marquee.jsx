import { cn } from '../../lib/utils';

export function Marquee({
    children,
    pauseOnHover = false,
    direction = 'left',
    speed = 30,
    className,
    trackClassName,
    ...props
}) {
    return (
        <div className={cn('w-full overflow-hidden', className)} {...props}>
            <div className="relative flex overflow-hidden">
                <div
                    className={cn(
                        'flex w-max shrink-0 animate-marquee items-center',
                        pauseOnHover && 'hover:[animation-play-state:paused]',
                        direction === 'right' && 'animate-marquee-reverse',
                        trackClassName,
                    )}
                    style={{ '--duration': `${speed}s` }}
                >
                    {children}
                    {children}
                </div>
            </div>
        </div>
    );
}
