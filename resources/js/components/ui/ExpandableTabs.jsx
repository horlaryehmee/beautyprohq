import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useOnClickOutside } from 'usehooks-ts';
import { cn } from '../../lib/utils';

const buttonVariants = {
    initial: { gap: 0, paddingLeft: '.55rem', paddingRight: '.55rem' },
    animate: (isSelected) => ({
        gap: isSelected ? '.4rem' : 0,
        paddingLeft: isSelected ? '.8rem' : '.55rem',
        paddingRight: isSelected ? '.8rem' : '.55rem',
    }),
};

const labelVariants = {
    initial: { width: 0, opacity: 0 },
    animate: { width: 'auto', opacity: 1 },
    exit: { width: 0, opacity: 0 },
};

const transition = { delay: 0.05, type: 'spring', bounce: 0, duration: 0.45 };

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
                'flex items-center justify-center gap-1 rounded-2xl border border-stone-200/90 bg-white/95 p-1.5 shadow-[0_12px_40px_rgba(41,19,31,.18)] backdrop-blur-xl',
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
                    <motion.button
                        animate="animate"
                        aria-current={isSelected ? 'page' : undefined}
                        aria-label={tab.title}
                        className={cn(
                            'relative flex h-11 min-w-10 items-center justify-center rounded-xl text-xs font-black transition-colors duration-300',
                            isSelected
                                ? cn('bg-rose-50', activeColor)
                                : 'text-stone-500 hover:bg-stone-50 hover:text-plum-950',
                        )}
                        custom={isSelected}
                        initial={false}
                        key={tab.title}
                        onClick={() => handleSelect(tab, index)}
                        transition={transition}
                        type="button"
                        variants={buttonVariants}
                    >
                        <TabIcon aria-hidden="true" size={20} strokeWidth={2.2} />
                        <AnimatePresence initial={false}>
                            {isSelected && (
                                <motion.span
                                    animate="animate"
                                    className="overflow-hidden whitespace-nowrap"
                                    exit="exit"
                                    initial="initial"
                                    transition={transition}
                                    variants={labelVariants}
                                >
                                    {tab.title}
                                </motion.span>
                            )}
                        </AnimatePresence>
                    </motion.button>
                );
            })}
        </div>
    );
}
