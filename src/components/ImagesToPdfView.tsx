import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import {
	SortableContext,
	arrayMove,
	rectSortingStrategy,
	sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import type { ImageItem, PdfBuildOptions, ProgressState, SortKey } from '../lib/types';
import { IDLE_PROGRESS } from '../lib/types';
import { IMAGE_ACCEPT_ATTRIBUTE, loadImageItems } from '../lib/images';
import { buildPdfFromImages, DEFAULT_PDF_OPTIONS } from '../lib/imagesToPdf';
import { downloadBlob } from '../lib/download';
import { commonPrefix, formatBytes, stripExtension, withExtension } from '../lib/format';
import { CUSTOM_PAGE_SIZE, PAGE_SIZES } from '../lib/pageSizes';
import { rotateClockwise, rotateCounterClockwise } from '../lib/layout';
import { usePersistentState } from '../hooks/usePersistentState';
import { DropZone } from './DropZone';
import { ImageCard } from './ImageCard';
import { ProgressBar } from './ProgressBar';
import { Button } from './Button';
import {
	ColorField,
	NumberField,
	SegmentedControl,
	Section,
	SelectField,
	SliderField,
	TextField,
	ToggleField,
} from './fields';
import { IconDownload, IconImage, IconSort, IconTrash, IconUpload } from './icons';

interface ImagesToPdfViewProps {
	notify: (kind: 'success' | 'error' | 'info' | 'warning', message: string, detail?: string) => void;
}

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
	{ value: 'manual', label: 'Manual order' },
	{ value: 'name', label: 'Name (natural)' },
	{ value: 'date', label: 'Date modified' },
	{ value: 'size', label: 'File size' },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function ImagesToPdfView({ notify }: ImagesToPdfViewProps) {
	const [items, setItems] = useState<ImageItem[]>([]);
	const [options, updateOptions, resetOptions] = usePersistentState<PdfBuildOptions>(
		'pixelpress:pdf-options',
		DEFAULT_PDF_OPTIONS,
	);
	const [progress, setProgress] = useState<ProgressState>(IDLE_PROGRESS);
	const [sortKey, setSortKey] = useState<SortKey>('manual');
	const [busy, setBusy] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const itemsRef = useRef<ImageItem[]>([]);

	itemsRef.current = items;

	// Release thumbnail object URLs when the view goes away.
	useEffect(
		() => () => {
			for (const item of itemsRef.current) {
				URL.revokeObjectURL(item.previewUrl);
			}
		},
		[],
	);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const totalBytes = useMemo(() => items.reduce((sum, item) => sum + item.size, 0), [items]);

	const addFiles = useCallback(
		async (files: File[]) => {
			setProgress({ active: true, current: 0, total: files.length, label: 'Reading images' });
			const { items: loaded, errors } = await loadImageItems(files, (current, total) => {
				setProgress({ active: true, current, total, label: 'Reading images' });
			});
			setProgress(IDLE_PROGRESS);

			if (loaded.length > 0) {
				setItems((current) => [...current, ...loaded]);
				setSortKey('manual');
				notify('success', `Added ${loaded.length} image${loaded.length === 1 ? '' : 's'}`);
			}
			if (errors.length > 0) {
				notify('warning', `Skipped ${errors.length} file${errors.length === 1 ? '' : 's'}`, errors.slice(0, 3).join(' · '));
			}
		},
		[notify],
	);

	const removeItem = useCallback((id: string) => {
		setItems((current) => {
			const target = current.find((item) => item.id === id);
			if (target) {
				URL.revokeObjectURL(target.previewUrl);
			}
			return current.filter((item) => item.id !== id);
		});
	}, []);

	const clearAll = useCallback(() => {
		setItems((current) => {
			for (const item of current) {
				URL.revokeObjectURL(item.previewUrl);
			}
			return [];
		});
		setSortKey('manual');
	}, []);

	const rotateItem = useCallback((id: string, direction: 1 | -1) => {
		setItems((current) =>
			current.map((item) =>
				item.id === id
					? {
							...item,
							rotation:
								direction === 1 ? rotateClockwise(item.rotation) : rotateCounterClockwise(item.rotation),
						}
					: item,
			),
		);
	}, []);

	const rotateAll = useCallback((direction: 1 | -1) => {
		setItems((current) =>
			current.map((item) => ({
				...item,
				rotation: direction === 1 ? rotateClockwise(item.rotation) : rotateCounterClockwise(item.rotation),
			})),
		);
	}, []);

	const applySort = useCallback((key: SortKey) => {
		setSortKey(key);
		if (key === 'manual') {
			return;
		}
		setItems((current) =>
			[...current].sort((a, b) => {
				switch (key) {
					case 'name':
						return collator.compare(a.name, b.name);
					case 'date':
						return a.lastModified - b.lastModified;
					case 'size':
						return a.size - b.size;
					default:
						return 0;
				}
			}),
		);
	}, []);

	const reverseOrder = useCallback(() => {
		setItems((current) => [...current].reverse());
		setSortKey('manual');
	}, []);

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			return;
		}
		setItems((current) => {
			const from = current.findIndex((item) => item.id === active.id);
			const to = current.findIndex((item) => item.id === over.id);
			return from === -1 || to === -1 ? current : arrayMove(current, from, to);
		});
		setSortKey('manual');
	}, []);

	const suggestedName = useMemo(() => {
		const only = items[0];
		if (!only) {
			return 'pixelpress.pdf';
		}
		if (items.length === 1) {
			return withExtension(stripExtension(only.name), '.pdf');
		}
		const shared = commonPrefix(items.map((item) => stripExtension(item.name)));
		return withExtension(shared.length >= 3 ? shared : 'pixelpress', '.pdf');
	}, [items]);

	const convert = useCallback(async () => {
		if (items.length === 0) {
			notify('warning', 'Add some images first');
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setBusy(true);
		setProgress({ active: true, current: 0, total: items.length, label: 'Preparing' });
		const startedAt = performance.now();

		try {
			const result = await buildPdfFromImages(
				items,
				{ ...options, fileName: options.fileName.trim() || suggestedName },
				(current, total, label) => setProgress({ active: true, current, total, label }),
				controller.signal,
			);
			downloadBlob(result.blob, result.fileName);
			notify(
				'success',
				`Created ${result.fileName}`,
				`${result.pageCount} page${result.pageCount === 1 ? '' : 's'} · ${formatBytes(
					result.byteLength,
				)} · ${Math.round(performance.now() - startedAt)} ms`,
			);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				notify('info', 'Conversion cancelled');
			} else {
				notify('error', 'Could not create the PDF', error instanceof Error ? error.message : String(error));
			}
		} finally {
			abortRef.current = null;
			setBusy(false);
			setProgress(IDLE_PROGRESS);
		}
	}, [items, notify, options, suggestedName]);

	const isCustomSize = options.pageSizeId === CUSTOM_PAGE_SIZE;
	const gridDisabled = options.imagesPerPage > 1;

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
			<div className="flex flex-col gap-4">
				<DropZone
					accept={IMAGE_ACCEPT_ATTRIBUTE}
					onFiles={addFiles}
					compact={items.length > 0}
					icon={<IconUpload className="size-8" />}
					title="Choose images"
					subtitle="or drop PNG, JPEG, WebP, GIF, BMP, AVIF, TIFF or SVG files (and folders) here. Everything is processed locally in your browser."
				/>

				<ProgressBar progress={progress} onCancel={busy ? () => abortRef.current?.abort() : undefined} />

				{items.length > 0 ? (
					<div className="card p-4">
						<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
									{items.length} image{items.length === 1 ? '' : 's'}
								</h2>
								<span className="chip tabular-nums">{formatBytes(totalBytes)}</span>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<SelectField
									label=""
									className="w-40 [&>label]:sr-only"
									value={sortKey}
									options={SORT_OPTIONS}
									onChange={applySort}
								/>
								<Button size="sm" onClick={reverseOrder} disabled={items.length < 2}>
									<IconSort className="size-3.5" />
									Reverse
								</Button>
								<Button size="sm" onClick={() => rotateAll(1)}>
									Rotate all
								</Button>
								<Button size="sm" variant="danger" onClick={clearAll}>
									<IconTrash className="size-3.5" />
									Clear
								</Button>
							</div>
						</div>

						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							modifiers={[restrictToParentElement]}
							onDragEnd={handleDragEnd}
						>
							<SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
								<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
									{items.map((item, index) => (
										<ImageCard
											key={item.id}
											item={item}
											index={index}
											onRemove={removeItem}
											onRotate={rotateItem}
										/>
									))}
								</ul>
							</SortableContext>
						</DndContext>
						<p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
							Drag the handle on a tile to reorder pages. Images are written to the PDF in the order shown.
						</p>
					</div>
				) : (
					<div className="card flex flex-col items-center gap-2 p-10 text-center">
						<IconImage className="size-10 text-slate-300 dark:text-slate-700" />
						<p className="text-sm font-medium text-slate-600 dark:text-slate-300">No images yet</p>
						<p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
							Add images to build a PDF. You can reorder, rotate and remove them before converting.
						</p>
					</div>
				)}
			</div>

			<aside className="flex flex-col gap-4">
				<Section title="Page setup" description="How each image is placed on the page.">
					<div className="flex flex-col gap-3">
						<SelectField
							label="Page size"
							value={options.pageSizeId}
							options={PAGE_SIZES.map((preset) => ({ value: preset.id, label: preset.label }))}
							onChange={(pageSizeId) => updateOptions({ pageSizeId })}
						/>
						{isCustomSize ? (
							<div className="grid grid-cols-2 gap-2">
								<NumberField
									label="Width"
									suffix="mm"
									min={10}
									max={2000}
									value={options.customWidthMm}
									onChange={(customWidthMm) => updateOptions({ customWidthMm })}
								/>
								<NumberField
									label="Height"
									suffix="mm"
									min={10}
									max={2000}
									value={options.customHeightMm}
									onChange={(customHeightMm) => updateOptions({ customHeightMm })}
								/>
							</div>
						) : null}
						<SegmentedControl
							label="Orientation"
							value={options.orientation}
							options={[
								{ value: 'auto', label: 'Auto' },
								{ value: 'portrait', label: 'Portrait' },
								{ value: 'landscape', label: 'Landscape' },
							]}
							onChange={(orientation) => updateOptions({ orientation })}
						/>
						<SegmentedControl
							label="Scaling"
							value={options.fit}
							options={[
								{ value: 'contain', label: 'Fit', title: 'Show the whole image inside the page' },
								{ value: 'cover', label: 'Fill', title: 'Fill the page, cropping the overflow' },
								{ value: 'stretch', label: 'Stretch', title: 'Ignore the original aspect ratio' },
							]}
							onChange={(fit) => updateOptions({ fit })}
						/>
						<NumberField
							label="Margin"
							suffix="mm"
							min={0}
							max={100}
							step={1}
							value={options.marginMm}
							onChange={(marginMm) => updateOptions({ marginMm: Math.max(0, marginMm) })}
						/>
						<SelectField
							label="Images per page"
							value={options.imagesPerPage}
							options={[
								{ value: 1, label: '1 (one per page)' },
								{ value: 2, label: '2 up' },
								{ value: 4, label: '4 up' },
								{ value: 6, label: '6 up' },
								{ value: 9, label: '9 up' },
							]}
							onChange={(imagesPerPage) =>
								updateOptions({ imagesPerPage: imagesPerPage as PdfBuildOptions['imagesPerPage'] })
							}
							hint={gridDisabled ? 'Grid layouts use A4 pages when page size is "Fit to image".' : undefined}
						/>
						<ColorField
							label="Page background"
							value={options.backgroundColor}
							onChange={(backgroundColor) => updateOptions({ backgroundColor })}
						/>
					</div>
				</Section>

				<Section title="Quality & size" description="Trade image fidelity for a smaller file.">
					<div className="flex flex-col gap-3">
						<ToggleField
							label="Compress images as JPEG"
							hint="Much smaller PDFs; removes transparency."
							checked={options.compress}
							onChange={(compress) => updateOptions({ compress })}
						/>
						<SliderField
							label="JPEG quality"
							min={0.3}
							max={1}
							step={0.05}
							value={options.jpegQuality}
							disabled={!options.compress}
							format={(value) => `${Math.round(value * 100)}%`}
							onChange={(jpegQuality) => updateOptions({ jpegQuality })}
						/>
						<NumberField
							label="Max image size"
							suffix="px"
							min={0}
							max={20000}
							step={100}
							value={options.maxDimension}
							hint="Longest edge. 0 keeps the original resolution."
							onChange={(maxDimension) => updateOptions({ maxDimension: Math.max(0, maxDimension) })}
						/>
					</div>
				</Section>

				<Section title="Document details" description="Optional PDF metadata.">
					<div className="flex flex-col gap-3">
						<TextField
							label="File name"
							value={options.fileName}
							placeholder={suggestedName}
							onChange={(fileName) => updateOptions({ fileName })}
						/>
						<TextField
							label="Title"
							value={options.title}
							onChange={(title) => updateOptions({ title })}
						/>
						<TextField
							label="Author"
							value={options.author}
							onChange={(author) => updateOptions({ author })}
						/>
						<TextField
							label="Subject"
							value={options.subject}
							onChange={(subject) => updateOptions({ subject })}
						/>
						<TextField
							label="Keywords"
							value={options.keywords}
							placeholder="comma, separated"
							onChange={(keywords) => updateOptions({ keywords })}
						/>
					</div>
				</Section>

				<div className="sticky bottom-0 -mx-1 flex flex-col gap-2 rounded-t-2xl border-t border-slate-200 bg-slate-50/95 px-1 pt-3 pb-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
					<Button
						variant="primary"
						size="lg"
						disabled={items.length === 0 || busy}
						onClick={convert}
						className="w-full"
					>
						<IconDownload className="size-4" />
						{busy ? 'Creating PDF…' : `Create PDF${items.length ? ` from ${items.length}` : ''}`}
					</Button>
					<Button size="sm" variant="ghost" onClick={resetOptions} className="w-full">
						Reset settings to defaults
					</Button>
				</div>
			</aside>
		</div>
	);
}
