import { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ImageItem } from '../lib/types';
import { formatBytes } from '../lib/format';
import { effectiveSize } from '../lib/images';
import { IconGrip, IconRotateCcw, IconRotateCw, IconTrash } from './icons';
import { IconButton } from './Button';

interface ImageCardProps {
	item: ImageItem;
	index: number;
	onRemove: (id: string) => void;
	onRotate: (id: string, direction: 1 | -1) => void;
}

/** Draggable thumbnail tile in the image queue. */
export const ImageCard = memo(function ImageCard({
	item,
	index,
	onRemove,
	onRotate,
}: ImageCardProps) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
		useSortable({ id: item.id });
	const size = effectiveSize(item);

	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white transition dark:bg-slate-900 ${
				isDragging
					? 'z-10 border-brand-500 opacity-90 shadow-lg'
					: 'border-slate-200 shadow-sm hover:border-brand-300 dark:border-slate-800 dark:hover:border-brand-700'
			}`}
		>
			<div className="relative flex h-32 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e293b_0_25%,transparent_0_50%)]">
				<img
					src={item.previewUrl}
					alt={item.name}
					loading="lazy"
					decoding="async"
					className="max-h-full max-w-full object-contain transition-transform"
					style={{ transform: `rotate(${item.rotation}deg)` }}
				/>
				<span className="absolute top-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
					{index + 1}
				</span>
				<button
					ref={setActivatorNodeRef}
					type="button"
					aria-label={`Reorder ${item.name}`}
					className="absolute top-1.5 right-1.5 cursor-grab rounded-md bg-slate-900/75 p-1 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
					{...attributes}
					{...listeners}
				>
					<IconGrip className="size-3.5" />
				</button>
			</div>

			<div className="flex flex-1 flex-col gap-1 p-2">
				<p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={item.name}>
					{item.name}
				</p>
				<p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
					{size.width} × {size.height} · {formatBytes(item.size)}
				</p>
				<div className="mt-auto flex items-center justify-end gap-0.5 pt-1">
					<IconButton label="Rotate left" onClick={() => onRotate(item.id, -1)}>
						<IconRotateCcw className="size-4" />
					</IconButton>
					<IconButton label="Rotate right" onClick={() => onRotate(item.id, 1)}>
						<IconRotateCw className="size-4" />
					</IconButton>
					<IconButton label={`Remove ${item.name}`} onClick={() => onRemove(item.id)}>
						<IconTrash className="size-4 text-red-500" />
					</IconButton>
				</div>
			</div>
		</li>
	);
});
