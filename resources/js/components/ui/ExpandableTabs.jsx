import { useEffect, useRef, useState } from 'react';
import { useOnClickOutside } from 'usehooks-ts';
import { cn } from '../../lib/utils';

export default function ExpandableTabs({
    tabs,
    className,
    activeColor = 'text-rose-600',
    activeIndex = null,
    onChange,
}) {
    const [selected, setSelected] = useState(activeIndex);
    const outsideClickRef = useRef(null);

    useEffect(() => setSelected(activeIndex), [activeIndex]);

    useOnClickOutside(outsideClickRef, () => setSelected(activeIndex));

    const handleSelect = (tab, index) => {
        setSelected(index);
        onChange?.(index, tab);
    };

    return (
        <div
            ref={outsideClickRef}
            className={cn(
                'flex transform-gpu items-center justify-center gap-1 rounded-2xl border border-stone-200/90 bg-white/95 p-1.5 shadow-[0_12px_40px_rgba(41,19,31,.18)] [backface-visibility:hidden] md:backdrop-blur-xl',
                className,
            )}
        >
            {tabs.map((tab, index) => {
                if (tab.type === 'separator') {
                    return <div aria-hidden="true" className="mx-0.5 h-6 w-px bg-stone-200" key={`separator-${index}`} />;
                }

                const TabIcon = tab.icon;
                const isSelected = selected === index;

                return (
                    <button
                        aria-current={isSelected ? 'page' : undefined}
                        aria-label={tab.title}
                        className={cn(
                            'relative flex h-11 min-w-10 items-center justify-center rounded-xl text-xs font-black transition-[gap,padding,background-color,color] duration-300 ease-out',
                            isSelected
                                ? cn('gap-1.5 bg-rose-50 px-3', activeColor)
                                : 'gap-0 px-[.55rem] text-stone-500 hover:bg-stone-50 hover:text-plum-950',
                        )}
                        key={tab.title}
                        onClick={() => handleSelect(tab, index)}
                        type="button"
                    >
                        <TabIcon aria-hidden="true" size={20} strokeWidth={2.2} />
                        <span className={cn(
                            'overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-300 ease-out',
                            isSelected ? 'max-w-24 opacity-100' : 'max-w-0 opacity-0',
                        )}>
                            {tab.title}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
