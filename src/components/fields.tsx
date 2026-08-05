import { useId, type ReactNode } from 'react';

export function Field({
	label,
	hint,
	children,
	className = '',
}: {
	label: string;
	hint?: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={className}>
			<span className="field-label">{label}</span>
			{children}
			{hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
		</div>
	);
}

export function SelectField<T extends string | number>({
	label,
	hint,
	value,
	options,
	onChange,
	className = '',
	disabled,
}: {
	label: string;
	hint?: string;
	value: T;
	options: Array<{ value: T; label: string }>;
	onChange: (value: T) => void;
	className?: string;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className={className}>
			<label className="field-label" htmlFor={id}>
				{label}
			</label>
			<select
				id={id}
				className="field-control cursor-pointer"
				value={value}
				disabled={disabled}
				onChange={(event) => {
					const raw = event.target.value;
					const match = options.find((option) => String(option.value) === raw);
					if (match) {
						onChange(match.value);
					}
				}}
			>
				{options.map((option) => (
					<option key={String(option.value)} value={String(option.value)}>
						{option.label}
					</option>
				))}
			</select>
			{hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
		</div>
	);
}

export function TextField({
	label,
	hint,
	value,
	onChange,
	placeholder,
	className = '',
	disabled,
	invalid,
}: {
	label: string;
	hint?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	className?: string;
	disabled?: boolean;
	invalid?: boolean;
}) {
	const id = useId();
	return (
		<div className={className}>
			<label className="field-label" htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				type="text"
				className={`field-control ${invalid ? 'border-red-400 dark:border-red-600' : ''}`}
				value={value}
				placeholder={placeholder}
				disabled={disabled}
				spellCheck={false}
				onChange={(event) => onChange(event.target.value)}
			/>
			{hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
		</div>
	);
}

export function NumberField({
	label,
	hint,
	value,
	onChange,
	min,
	max,
	step = 1,
	suffix,
	className = '',
	disabled,
}: {
	label: string;
	hint?: string;
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	suffix?: string;
	className?: string;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className={className}>
			<label className="field-label" htmlFor={id}>
				{label}
			</label>
			<div className="relative">
				<input
					id={id}
					type="number"
					className={`field-control ${suffix ? 'pr-12' : ''}`}
					value={Number.isFinite(value) ? value : ''}
					min={min}
					max={max}
					step={step}
					disabled={disabled}
					onChange={(event) => {
						const parsed = Number.parseFloat(event.target.value);
						onChange(Number.isFinite(parsed) ? parsed : 0);
					}}
				/>
				{suffix ? (
					<span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">
						{suffix}
					</span>
				) : null}
			</div>
			{hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
		</div>
	);
}

export function SliderField({
	label,
	value,
	onChange,
	min,
	max,
	step,
	format,
	className = '',
	disabled,
}: {
	label: string;
	value: number;
	onChange: (value: number) => void;
	min: number;
	max: number;
	step: number;
	format?: (value: number) => string;
	className?: string;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className={className}>
			<div className="flex items-baseline justify-between">
				<label className="field-label" htmlFor={id}>
					{label}
				</label>
				<span className="mb-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
					{format ? format(value) : value}
				</span>
			</div>
			<input
				id={id}
				type="range"
				className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-700"
				value={value}
				min={min}
				max={max}
				step={step}
				disabled={disabled}
				onChange={(event) => onChange(Number.parseFloat(event.target.value))}
			/>
		</div>
	);
}

export function ToggleField({
	label,
	hint,
	checked,
	onChange,
	disabled,
	className = '',
}: {
	label: string;
	hint?: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	className?: string;
}) {
	const id = useId();
	return (
		<div className={`flex items-start gap-3 ${className}`}>
			<button
				id={id}
				type="button"
				role="switch"
				aria-checked={checked}
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
					checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
				}`}
			>
				<span
					className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${
						checked ? 'left-4.5' : 'left-0.5'
					}`}
				/>
			</button>
			<label htmlFor={id} className="cursor-pointer select-none">
				<span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
				{hint ? <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
			</label>
		</div>
	);
}

export function ColorField({
	label,
	value,
	onChange,
	className = '',
	disabled,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	className?: string;
	disabled?: boolean;
}) {
	const id = useId();
	return (
		<div className={className}>
			<label className="field-label" htmlFor={id}>
				{label}
			</label>
			<div className="flex items-center gap-2">
				<input
					id={id}
					type="color"
					className="size-9 cursor-pointer rounded-lg border border-slate-300 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900"
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
				/>
				<input
					type="text"
					aria-label={`${label} hex value`}
					className="field-control font-mono text-xs"
					value={value}
					disabled={disabled}
					spellCheck={false}
					onChange={(event) => onChange(event.target.value)}
				/>
			</div>
		</div>
	);
}

export function SegmentedControl<T extends string | number>({
	label,
	value,
	options,
	onChange,
	className = '',
	disabled,
}: {
	label: string;
	value: T;
	options: Array<{ value: T; label: string; title?: string }>;
	onChange: (value: T) => void;
	className?: string;
	disabled?: boolean;
}) {
	return (
		<div className={className}>
			<span className="field-label">{label}</span>
			<div
				role="group"
				aria-label={label}
				className="inline-flex w-full rounded-lg border border-slate-300 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800"
			>
				{options.map((option) => {
					const active = option.value === value;
					return (
						<button
							key={String(option.value)}
							type="button"
							title={option.title}
							disabled={disabled}
							aria-pressed={active}
							onClick={() => onChange(option.value)}
							className={`flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
								active
									? 'bg-white text-brand-700 shadow-sm dark:bg-slate-950 dark:text-brand-300'
									: 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
							}`}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}

export function Section({
	title,
	description,
	children,
	actions,
}: {
	title: string;
	description?: string;
	children: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<section className="card p-4">
			<div className="mb-3 flex items-start justify-between gap-3">
				<div>
					<h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
					{description ? (
						<p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
					) : null}
				</div>
				{actions}
			</div>
			{children}
		</section>
	);
}
