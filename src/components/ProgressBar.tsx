import type { ProgressState } from '../lib/types';

export function ProgressBar({
	progress,
	onCancel,
}: {
	progress: ProgressState;
	onCancel?: () => void;
}) {
	if (!progress.active) {
		return null;
	}

	const percent =
		progress.total > 0 ? Math.min(100, Math.round((progress.current / progress.total) * 100)) : 0;

	return (
		<div className="rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-900/60 dark:bg-brand-950/40">
			<div className="mb-2 flex items-center justify-between gap-3 text-xs">
				<span className="truncate font-medium text-brand-900 dark:text-brand-100">
					{progress.label || 'Working…'}
				</span>
				<span className="flex shrink-0 items-center gap-2 tabular-nums text-brand-700 dark:text-brand-300">
					{progress.total > 0 ? `${progress.current}/${progress.total}` : ''} {percent}%
					{onCancel ? (
						<button
							type="button"
							onClick={onCancel}
							className="cursor-pointer rounded px-1.5 py-0.5 font-medium text-brand-800 underline-offset-2 hover:underline dark:text-brand-200"
						>
							Cancel
						</button>
					) : null}
				</span>
			</div>
			<div
				className="h-2 overflow-hidden rounded-full bg-brand-200 dark:bg-brand-900"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={percent}
				aria-label={progress.label || 'Conversion progress'}
			>
				<div
					className="h-full rounded-full bg-brand-600 transition-[width] duration-200 dark:bg-brand-400"
					style={{ width: `${percent}%` }}
				/>
			</div>
		</div>
	);
}
