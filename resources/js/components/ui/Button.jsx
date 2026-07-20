import { cn } from '../../lib/utils';

export function buttonClass({ variant = 'primary', size = 'md', className } = {}) {
    const variants = {
        primary: 'bg-plum-900 text-white shadow-[0_10px_24px_rgba(74,32,62,.18)] hover:bg-plum-800 focus-visible:ring-plum-300',
        rose: 'bg-rose-600 text-white shadow-[0_10px_24px_rgba(216,86,124,.2)] hover:bg-rose-700 focus-visible:ring-rose-300',
        secondary: 'border border-plum-100 bg-white text-plum-950 hover:border-rose-200 hover:bg-rose-50 focus-visible:ring-rose-200',
        soft: 'bg-rose-50 text-rose-800 hover:bg-rose-100 focus-visible:ring-rose-200',
        ghost: 'text-plum-800 hover:bg-plum-50 focus-visible:ring-plum-200',
        danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-200',
    };
    const sizes = {
        sm: 'min-h-9 px-3.5 text-xs',
        md: 'min-h-11 px-5 text-sm',
        lg: 'min-h-13 px-6 text-sm sm:text-base',
        icon: 'size-11',
    };

    return cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant] ?? variants.primary,
        sizes[size] ?? sizes.md,
        className,
    );
}

export default function Button({ variant, size, className, type = 'button', ...props }) {
    return <button type={type} className={buttonClass({ variant, size, className })} {...props} />;
}
