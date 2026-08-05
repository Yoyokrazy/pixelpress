import { memo } from 'react';
import type { RenderedPage } from '../lib/types';
import { formatBytes } from '../lib/format';
import { IconDownload } from './icons';
import { IconButton } from './Button';

interface PageCardProps {
	page: RenderedPage;
	onToggle: (id: string) => void;
	onDownload: (page: RenderedPage) => void;
}

/** Result tile for a single rasterised PDF page. */
export const PageCard = memo(function PageCard({ page, onToggle, onDownload }: PageCardProps) {
	return (
		<li
			className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white transition dark:bg-slate-900 ${
				page.selected
					? 'border-brand-400 shadow-sm dark:border-brand-600'
					: 'border-slate-200 opacity-60 dark:border-slate-800'
			}`}
		>
			<button
				type="button"
				onClick={() => onToggle(page.id)}
				aria-pressed={page.selected}
				aria-label={`${page.selected ? 'Deselect' : 'Select'} page ${page.pageNumber} of ${page.sourceName}`}
				className="relative flex h-36 cursor-pointer items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e293b_0_25%,transparent_0_50%)]"
			>
				<img
					src={page.url}
					alt={`Page ${page.pageNumber}`}
					loading="lazy"
					decoding="async"
					className="max-h-full max-w-full object-contain shadow-sm"
				/>
				<span className="absolute top-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
					p{page.pageNumber}
				</span>
				<span
					className={`absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-md border text-[10px] font-bold transition ${
						page.selected
							? 'border-brand-600 bg-brand-600 text-white'
							: 'border-white/70 bg-slate-900/50 text-transparent'
					}`}
				>
					✓
				</span>
			</button>

			<div className="flex flex-1 flex-col gap-1 p-2">
				<p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={page.fileName}>
					{page.fileName}
				</p>
				<p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
					{page.width} × {page.height} · {formatBytes(page.blob.size)}
				</p>
				<div className="mt-auto flex justify-end pt-1">
					<IconButton label={`Download ${page.fileName}`} onClick={() => onDownload(page)}>
						<IconDownload className="size-4" />
					</IconButton>
				</div>
			</div>
		</li>
	);
});
