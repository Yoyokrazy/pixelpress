import type { Toast } from '../hooks/useToasts';
import { IconAlert, IconCheck, IconClose, IconInfo } from './icons';

const STYLES: Record<Toast['kind'], { wrapper: string; icon: string }> = {
	success: {
		wrapper:
			'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/70 dark:text-emerald-100',
		icon: 'text-emerald-600 dark:text-emerald-400',
	},
	error: {
		wrapper:
			'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/70 dark:text-red-100',
		icon: 'text-red-600 dark:text-red-400',
	},
	warning: {
		wrapper:
			'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/70 dark:text-amber-100',
		icon: 'text-amber-600 dark:text-amber-400',
	},
	info: {
		wrapper:
			'border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100',
		icon: 'text-brand-600 dark:text-brand-400',
	},
};

function ToastIcon({ kind, className }: { kind: Toast['kind']; className: string }) {
	if (kind === 'success') {
		return <IconCheck className={`size-4 ${className}`} />;
	}
	if (kind === 'error' || kind === 'warning') {
		return <IconAlert className={`size-4 ${className}`} />;
	}
	return <IconInfo className={`size-4 ${className}`} />;
}

export function Toaster({
	toasts,
	onDismiss,
}: {
	toasts: Toast[];
	onDismiss: (id: string) => void;
}) {
	return (
		<div
			aria-live="polite"
			aria-atomic="false"
			className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
		>
			{toasts.map((toast) => {
				const style = STYLES[toast.kind];
				return (
					<div
						key={toast.id}
						role="status"
						className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3 shadow-lg ${style.wrapper}`}
					>
						<ToastIcon kind={toast.kind} className={style.icon} />
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium">{toast.message}</p>
							{toast.detail ? (
								<p className="mt-0.5 text-xs break-words opacity-80">{toast.detail}</p>
							) : null}
						</div>
						<button
							type="button"
							onClick={() => onDismiss(toast.id)}
							aria-label="Dismiss notification"
							className="cursor-pointer rounded p-0.5 opacity-60 transition hover:opacity-100"
						>
							<IconClose className="size-4" />
						</button>
					</div>
				);
			})}
		</div>
	);
}
