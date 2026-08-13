import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImageItem, ProgressState } from '../lib/types';
import { IDLE_PROGRESS } from '../lib/types';
import { loadImageItems } from '../lib/images';
import {
	DEFAULT_RESIZE_OPTIONS,
	RESIZE_ACCEPT_ATTRIBUTE,
	RESIZE_PERCENTAGE_PRESETS,
	byteSavings,
	computeResizedDimensions,
	resizeImageFile,
	type ResizeOptions,
	type ResizeResult,
} from '../lib/resizeImages';
import { downloadAsZip, downloadBlob } from '../lib/download';
import { commonPrefix, formatBytes, stripExtension } from '../lib/format';
import { usePersistentState } from '../hooks/usePersistentState';
import { DropZone } from './DropZone';
import { ProgressBar } from './ProgressBar';
import { Button } from './Button';
import {
	ColorField,
	NumberField,
	SegmentedControl,
	Section,
	SelectField,
	SliderField,
} from './fields';
import { IconDownload, IconResize, IconTrash, IconUpload } from './icons';

interface ResizeImagesViewProps {
	notify: (kind: 'success' | 'error' | 'info' | 'warning', message: string, detail?: string) => void;
}

interface PreviewState {
	status: 'pending' | 'ready' | 'error';
	width?: number;
	height?: number;
	bytes?: number;
}

/** Delay before re-encoding previews so dragging a slider does not thrash the canvas. */
const PREVIEW_DEBOUNCE_MS = 200;

/**
 * How many previews to re-encode at once. Canvas encoding is CPU-bound, so a
 * small pool keeps a large queue responsive without oversubscribing the main
 * thread (a strict one-at-a-time loop stalls; unbounded parallelism thrashes).
 */
const PREVIEW_CONCURRENCY = 3;

/** Quick-scale buttons, including a 100% "reset to original" option. */
const PRESET_PERCENTAGES: number[] = [...RESIZE_PERCENTAGE_PRESETS, 100];

export function ResizeImagesView({ notify }: ResizeImagesViewProps) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [options, updateOptions, resetOptions] = usePersistentState<ResizeOptions>(
		'pixelpress:resize-options',
		DEFAULT_RESIZE_OPTIONS,
	);
	const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
	const [progress, setProgress] = useState<ProgressState>(IDLE_PROGRESS);
	const [busy, setBusy] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const itemsRef = useRef<ImageItem[]>([]);
	// Cache of encoded results keyed by item id, tagged with the settings that
	// produced them so a preview can be reused for the actual download.
	const cacheRef = useRef<Map<string, { signature: string; result: ResizeResult }>>(new Map());

	itemsRef.current = items;

	const optionsSignature = useMemo(() => JSON.stringify(options), [options]);

	useEffect(
		() => () => {
			for (const item of itemsRef.current) {
				URL.revokeObjectURL(item.previewUrl);
			}
		},
		[],
	);

	const addFiles = useCallback(
		async (files: File[]) => {
			setProgress({ active: true, current: 0, total: files.length, label: 'Reading images' });
			const { items: loaded, errors } = await loadImageItems(files, (current, total) => {
				setProgress({ active: true, current, total, label: 'Reading images' });
			});
			setProgress(IDLE_PROGRESS);

			if (loaded.length > 0) {
				setItems((current) => [...current, ...loaded]);
				notify('success', `Added ${loaded.length} image${loaded.length === 1 ? '' : 's'}`);
			}
			if (errors.length > 0) {
				notify(
					'warning',
					`Skipped ${errors.length} file${errors.length === 1 ? '' : 's'}`,
					errors.slice(0, 3).join(' · '),
				);
			}
		},
		[notify],
	);

	const removeItem = useCallback((id: string) => {
		cacheRef.current.delete(id);
		setPreviews((current) => {
			const next = { ...current };
			delete next[id];
			return next;
		});
		setItems((current) => {
			const target = current.find((item) => item.id === id);
			if (target) {
				URL.revokeObjectURL(target.previewUrl);
			}
			return current.filter((item) => item.id !== id);
		});
	}, []);

	const clearAll = useCallback(() => {
		cacheRef.current.clear();
		setPreviews({});
		setItems((current) => {
			for (const item of current) {
				URL.revokeObjectURL(item.previewUrl);
			}
			return [];
		});
	}, []);

	// Recompute output-size previews whenever the queue or the settings change.
	useEffect(() => {
		if (items.length === 0) {
			return;
		}

		const stale = items.filter((item) => {
			const cached = cacheRef.current.get(item.id);
			return !cached || cached.signature !== optionsSignature;
		});
		if (stale.length === 0) {
			return;
		}

		setPreviews((current) => {
			const next = { ...current };
			for (const item of stale) {
				next[item.id] = { status: 'pending' };
			}
			return next;
		});

		let cancelled = false;
		const timer = setTimeout(() => {
			const queue = [...stale];

			const encodeOne = async (item: ImageItem): Promise<void> => {
				try {
					const result = await resizeImageFile(item, options);
					if (cancelled) {
						return;
					}
					cacheRef.current.set(item.id, { signature: optionsSignature, result });
					setPreviews((current) => ({
						...current,
						[item.id]: {
							status: 'ready',
							width: result.width,
							height: result.height,
							bytes: result.blob.size,
						},
					}));
				} catch {
					if (cancelled) {
						return;
					}
					setPreviews((current) => ({ ...current, [item.id]: { status: 'error' } }));
				}
			};

			// Each worker pulls the next item off the shared queue until it drains,
			// capping concurrency at PREVIEW_CONCURRENCY regardless of queue length.
			const worker = async (): Promise<void> => {
				while (!cancelled) {
					const next = queue.shift();
					if (!next) {
						return;
					}
					await encodeOne(next);
				}
			};

			const pool = Math.min(PREVIEW_CONCURRENCY, queue.length);
			void Promise.all(Array.from({ length: pool }, () => worker()));
		}, PREVIEW_DEBOUNCE_MS);

		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [items, options, optionsSignature]);

	const totals = useMemo(() => {
		let original = 0;
		let output = 0;
		let ready = 0;
		for (const item of items) {
			original += item.size;
			const preview = previews[item.id];
			if (preview?.status === 'ready' && preview.bytes !== undefined) {
				output += preview.bytes;
				ready += 1;
			}
		}
		return { original, output, ready };
	}, [items, previews]);

	const zipName = useMemo(() => {
		if (items.length === 0) {
			return 'pixelpress-resized';
		}
		const shared = commonPrefix(items.map((item) => stripExtension(item.name)));
		return shared.length >= 3 ? `${shared}-resized` : 'pixelpress-resized';
	}, [items]);

	const download = useCallback(async () => {
		if (items.length === 0) {
			notify('warning', 'Add some images first');
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setBusy(true);
		setProgress({ active: true, current: 0, total: items.length, label: 'Resizing' });
		const startedAt = performance.now();

		try {
			const results: ResizeResult[] = [];
			let done = 0;
			for (const item of items) {
				if (controller.signal.aborted) {
					throw new DOMException('Resize cancelled', 'AbortError');
				}
				setProgress({ active: true, current: done, total: items.length, label: item.name });
				const cached = cacheRef.current.get(item.id);
				const result =
					cached && cached.signature === optionsSignature
						? cached.result
						: await resizeImageFile(item, options);
				cacheRef.current.set(item.id, { signature: optionsSignature, result });
				results.push(result);
				done += 1;
				setProgress({ active: true, current: done, total: items.length, label: item.name });
			}

			const outputBytes = results.reduce((sum, result) => sum + result.blob.size, 0);
			const originalBytes = items.reduce((sum, item) => sum + item.size, 0);
			const saved = byteSavings(originalBytes, outputBytes);

			const single = results.length === 1 ? results[0] : undefined;
			if (single) {
				downloadBlob(single.blob, single.fileName);
			} else {
				await downloadAsZip(
					results.map((result) => ({ fileName: result.fileName, blob: result.blob })),
					zipName,
				);
			}

			notify(
				'success',
				single ? `Saved ${single.fileName}` : `Saved ${results.length} images`,
				`${formatBytes(originalBytes)} → ${formatBytes(outputBytes)} · ${formatSavings(saved)} · ${Math.round(
					performance.now() - startedAt,
				)} ms`,
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				notify('info', 'Resize cancelled');
			} else {
				notify(
					'error',
					'Could not resize the images',
					error instanceof Error ? error.message : String(error),
				);
			}
		} finally {
			abortRef.current = null;
			setBusy(false);
			setProgress(IDLE_PROGRESS);
		}
	}, [items, notify, options, optionsSignature, zipName]);

	const overallSaved = totals.original > 0 ? byteSavings(totals.original, totals.output) : 0;
	const qualityDisabled = options.format === 'png';

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
			<div className="flex flex-col gap-4">
				<DropZone
					accept={RESIZE_ACCEPT_ATTRIBUTE}
					onFiles={addFiles}
					compact={items.length > 0}
					icon={<IconUpload className="size-8" />}
					title="Choose images to shrink"
					subtitle="or drop PNG, JPEG or WebP files here. Resizing runs locally in your browser — nothing is uploaded."
				/>

				<ProgressBar progress={progress} onCancel={busy ? () => abortRef.current?.abort() : undefined} />

				{items.length > 0 ? (
					<div className="card p-4">
						<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
									{items.length} image{items.length === 1 ? '' : 's'}
								</h2>
								<span className="chip tabular-nums">
									{formatBytes(totals.original)}
									{totals.ready === items.length ? (
										<> → {formatBytes(totals.output)}</>
									) : null}
								</span>
								{totals.ready === items.length && totals.original > 0 ? (
									<span
										className={`chip tabular-nums ${
											overallSaved > 0
												? 'text-emerald-600 dark:text-emerald-400'
												: 'text-amber-600 dark:text-amber-400'
										}`}
									>
										{formatSavings(overallSaved)}
									</span>
								) : null}
							</div>
							<Button size="sm" variant="danger" onClick={clearAll}>
								<IconTrash className="size-3.5" />
								Clear
							</Button>
						</div>

						<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
							{items.map((item) => (
								<ResizeCard
									key={item.id}
									item={item}
									preview={previews[item.id]}
									target={computeResizedDimensions(item.width, item.height, options)}
									onRemove={removeItem}
								/>
							))}
						</ul>
					</div>
				) : (
					<div className="card flex flex-col items-center gap-2 p-10 text-center">
						<IconResize className="size-10 text-slate-300 dark:text-slate-700" />
						<p className="text-sm font-medium text-slate-600 dark:text-slate-300">No images yet</p>
						<p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
							Add PNG, JPEG or WebP images to scale them down. Each tile previews the output
							dimensions and file size before you download.
						</p>
					</div>
				)}
			</div>

			<aside className="flex flex-col gap-4">
				<Section title="Resize" description="Scale the pixels down to shrink the file.">
					<div className="flex flex-col gap-3">
						<SegmentedControl
							label="Method"
							value={options.mode}
							options={[
								{ value: 'percentage', label: 'Percentage', title: 'Scale by a percentage' },
								{ value: 'longestEdge', label: 'Max size', title: 'Cap the longest edge' },
							]}
							onChange={(mode) => updateOptions({ mode })}
						/>
						{options.mode === 'percentage' ? (
							<>
								<SliderField
									label="Scale"
									min={5}
									max={100}
									step={5}
									value={options.percentage}
									format={(value) => `${Math.round(value)}%`}
									onChange={(percentage) => updateOptions({ percentage })}
								/>
								<SegmentedControl
									label="Quick presets"
									value={PRESET_PERCENTAGES.includes(options.percentage) ? options.percentage : 0}
									options={PRESET_PERCENTAGES.map((preset) => ({
										value: preset,
										label: `${preset}%`,
									}))}
									onChange={(percentage) => updateOptions({ percentage })}
								/>
							</>
						) : (
							<NumberField
								label="Longest edge"
								suffix="px"
								min={16}
								max={20000}
								step={100}
								value={options.longestEdge}
								hint="Images are only ever scaled down, never enlarged."
								onChange={(longestEdge) => updateOptions({ longestEdge: Math.max(16, longestEdge) })}
							/>
						)}
					</div>
				</Section>

				<Section title="Output" description="Encoding and quality of the saved files.">
					<div className="flex flex-col gap-3">
						<SelectField
							label="Format"
							value={options.format}
							options={[
								{ value: 'keep', label: 'Keep original format' },
								{ value: 'jpeg', label: 'JPEG' },
								{ value: 'png', label: 'PNG' },
								{ value: 'webp', label: 'WebP' },
							]}
							onChange={(format) => updateOptions({ format })}
						/>
						<SliderField
							label="Quality"
							min={0.3}
							max={1}
							step={0.05}
							value={options.quality}
							disabled={qualityDisabled}
							format={(value) => `${Math.round(value * 100)}%`}
							onChange={(quality) => updateOptions({ quality })}
						/>
						{qualityDisabled ? (
							<p className="text-xs text-slate-500 dark:text-slate-400">
								PNG is lossless, so quality only applies to JPEG and WebP.
							</p>
						) : null}
						<ColorField
							label="JPEG background"
							value={options.backgroundColor}
							onChange={(backgroundColor) => updateOptions({ backgroundColor })}
						/>
					</div>
				</Section>

				<div className="sticky bottom-0 -mx-1 flex flex-col gap-2 rounded-t-2xl border-t border-slate-200 bg-slate-50/95 px-1 pt-3 pb-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
					<Button
						variant="primary"
						size="lg"
						disabled={items.length === 0 || busy}
						onClick={download}
						className="w-full"
					>
						<IconDownload className="size-4" />
						{busy
							? 'Resizing…'
							: items.length > 1
								? `Resize & download ${items.length} (.zip)`
								: 'Resize & download'}
					</Button>
					<Button size="sm" variant="ghost" onClick={resetOptions} className="w-full">
						Reset settings to defaults
					</Button>
				</div>
			</aside>
		</div>
	);
}

function formatSavings(fraction: number): string {
	const percent = Math.round(fraction * 100);
	if (percent > 0) {
		return `${percent}% smaller`;
	}
	if (percent < 0) {
		return `${Math.abs(percent)}% larger`;
	}
	return 'same size';
}

interface ResizeCardProps {
	item: ImageItem;
	preview: PreviewState | undefined;
	target: { width: number; height: number };
	onRemove: (id: string) => void;
}

function ResizeCard({ item, preview, target, onRemove }: ResizeCardProps) {
	const ready = preview?.status === 'ready';
	const saved =
		ready && preview.bytes !== undefined ? byteSavings(item.size, preview.bytes) : undefined;

	return (
		<li className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700">
			<div className="relative flex h-32 items-center justify-center overflow-hidden bg-[repeating-conic-gradient(#e2e8f0_0_25%,transparent_0_50%)] bg-[length:16px_16px] dark:bg-[repeating-conic-gradient(#1e293b_0_25%,transparent_0_50%)]">
				<img
					src={item.previewUrl}
					alt={item.name}
					loading="lazy"
					decoding="async"
					className="max-h-full max-w-full object-contain"
				/>
				<button
					type="button"
					aria-label={`Remove ${item.name}`}
					onClick={() => onRemove(item.id)}
					className="absolute top-1.5 right-1.5 cursor-pointer rounded-md bg-slate-900/75 p-1 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
				>
					<IconTrash className="size-3.5" />
				</button>
			</div>

			<div className="flex flex-1 flex-col gap-1 p-2">
				<p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={item.name}>
					{item.name}
				</p>
				<p className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
					{item.width} × {item.height} → {target.width} × {target.height}
				</p>
				<div className="mt-auto flex items-center justify-between gap-1 pt-1 text-[11px] tabular-nums">
					<span className="text-slate-500 dark:text-slate-400">
						{formatBytes(item.size)}
						{ready && preview.bytes !== undefined ? (
							<> → {formatBytes(preview.bytes)}</>
						) : preview?.status === 'error' ? (
							<> → failed</>
						) : (
							<> → …</>
						)}
					</span>
					{saved !== undefined ? (
						<span
							className={`rounded px-1 font-semibold ${
								saved > 0
									? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
									: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
							}`}
						>
							{saved > 0 ? '−' : '+'}
							{Math.abs(Math.round(saved * 100))}%
						</span>
					) : null}
				</div>
			</div>
		</li>
	);
}
