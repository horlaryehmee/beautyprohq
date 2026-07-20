import { useId, useState } from 'react';
import Icon from './Icon';
import { cn } from '../../lib/utils';

export default function FormField({
    label,
    error,
    hint,
    icon,
    className,
    inputClassName,
    type = 'text',
    id,
    as = 'input',
    children,
    ...props
}) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const [visible, setVisible] = useState(false);
    const Component = as;
    const password = type === 'password';

    return (
        <div className={cn('space-y-1.5', className)}>
            {label && <label htmlFor={fieldId} className="block text-sm font-bold text-plum-950">{label}</label>}
            <div className="relative">
                {icon && <Icon name={icon} size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />}
                <Component
                    id={fieldId}
                    type={as === 'input' ? (password ? (visible ? 'text' : 'password') : type) : undefined}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
                    className={cn(
                        'min-h-12 w-full rounded-xl border bg-white px-3.5 text-sm text-plum-950 outline-none transition placeholder:text-stone-400 focus:border-rose-400 focus:ring-4 focus:ring-rose-100',
                        icon && 'pl-10',
                        password && 'pr-11',
                        as === 'textarea' && 'min-h-28 resize-y py-3',
                        error ? 'border-red-400' : 'border-stone-200',
                        inputClassName,
                    )}
                    {...props}
                >
                    {children}
                </Component>
                {password && (
                    <button
                        type="button"
                        onClick={() => setVisible((value) => !value)}
                        className="absolute right-2.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-50 hover:text-plum-800"
                        aria-label={visible ? 'Hide password' : 'Show password'}
                    >
                        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
                    </button>
                )}
            </div>
            {error ? <p id={`${fieldId}-error`} className="text-xs font-semibold text-red-600">{error}</p> : hint ? <p id={`${fieldId}-hint`} className="text-xs text-stone-500">{hint}</p> : null}
        </div>
    );
}
