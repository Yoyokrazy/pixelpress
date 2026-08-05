import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
	primary:
		'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:hover:bg-brand-600',
	secondary:
		'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
	ghost:
		'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
	danger:
		'border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50',
};

const SIZES: Record<Size, string> = {
	sm: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-xs',
	md: 'gap-2 rounded-lg px-3.5 py-2 text-sm',
	lg: 'gap-2 rounded-xl px-5 py-2.5 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	size?: Size;
	children?: ReactNode;
}

export function Button({
	variant = 'secondary',
	size = 'md',
	className = '',
	type = 'button',
	children,
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			className={`inline-flex cursor-pointer items-center justify-center font-medium transition select-none disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	label: string;
	variant?: Variant;
	children: ReactNode;
}

export function IconButton({
	label,
	variant = 'ghost',
	className = '',
	type = 'button',
	children,
	...props
}: IconButtonProps) {
	return (
		<button
			type={type}
			title={label}
			aria-label={label}
			className={`inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
			{...props}
		>
			{children}
		</button>
	);
}
