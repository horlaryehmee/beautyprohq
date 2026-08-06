import { cn } from '../../lib/utils';

export function buttonClass({ variant = 'primary', size = 'md', className } = {}) {
    const variants = {
        primary: 'bg-bphq-coffee text-white shadow-[0_10px_24px_rgba(58,42,31,.18)] hover:bg-bphq-espresso focus-visible:ring-bphq-beige',
        rose: 'bg-bphq-coffee text-white shadow-[0_10px_24px_rgba(58,42,31,.18)] hover:bg-bphq-espresso focus-visible:ring-bphq-beige',
        secondary: 'border border-bphq-chrome bg-white text-bphq-espresso hover:bg-bphq-ivory focus-visible:ring-bphq-beige',
        soft: 'bg-bphq-ivory text-bphq-espresso hover:bg-bphq-beige focus-visible:ring-bphq-beige',
        ghost: 'text-bphq-espresso hover:bg-bphq-ivory focus-visible:ring-bphq-beige',
        danger: 'bg-bphq-coffee text-white hover:bg-bphq-espresso focus-visible:ring-bphq-beige',
    };
    const sizes = {
        sm: 'min-h-9 px-3.5 text-xs',
        md: 'min-h-11 px-5 text-sm',
        lg: 'min-h-13 px-6 text-sm sm:text-base',
        icon: 'size-11',
    };

    return cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold leading-[1.2] transition duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant] ?? variants.primary,
        sizes[size] ?? sizes.md,
        className,
    );
}

export default function Button({ variant, size, className, type = 'button', ...props }) {
    return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}
