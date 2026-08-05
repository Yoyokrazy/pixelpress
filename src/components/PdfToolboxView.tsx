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
	useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ProgressState, Rotation } from '../lib/types';
import { IDLE_PROGRESS } from '../lib/types';
import { isPdfFile, nextId } from '../lib/images';
import { rotateClockwise, rotateCounterClockwise } from '../lib/layout';
import {
	editPdfPages,
	inspectPdf,
	mergePdfs,
	planSplit,
	splitPdf,
	type PageEdit,
	type SplitMode,
	type SplitOptions,
} from '../lib/pdfTools';
import { describeError, renderPdfThumbnails } from '../lib/pdfToImages';
import { downloadAsZip, downloadBlob } from '../lib/download';
import { commonPrefix, formatBytes, stripExtension } from '../lib/format';
import { DropZone } from './DropZone';
import { ProgressBar } from './ProgressBar';
import { Button, IconButton } from './Button';
import { NumberField, SegmentedControl, Section, SelectField, TextField } from './fields';
import {
	IconDownload,
	IconFilePdf,
	IconGrip,
	IconMerge,
	IconRotateCcw,
	IconRotateCw,
	IconScissors,
	IconTrash,
	IconUpload,
} from './icons';

interface ToolboxDoc {
	id: string;
	file: File;
	name: string;
	size: number;
	pageCount: number;
}

interface EditablePage extends PageEdit {
	id: string;
	thumbnailUrl?: string;
}

type ToolMode = 'merge' | 'split' | 'organise';

interface PdfToolboxViewProps {
	notify: (kind: 'success' | 'error' | 'info' | 'warning', message: string, detail?: string) => void;
}

const DEFAULT_SPLIT: SplitOptions = { mode: 'every', chunkSize: 1, ranges: '1-2; 3-4' };

export function PdfToolboxView({ notify }: PdfToolboxViewProps) {
	const [mode, setMode] = useState<ToolMode>('merge');
	const [docs, setDocs] = useState<ToolboxDoc[]>([]);
	const [pages, setPages] = useState<EditablePage[]>([]);
	const [split, setSplit] = useState<SplitOptions>(DEFAULT_SPLIT);
	const [outputName, setOutputName] = useState('');
	const [progress, setProgress] = useState<ProgressState>(IDLE_PROGRESS);
	const [busy, setBusy] = useState(false);
	const pagesRef = useRef<EditablePage[]>([]);

	pagesRef.current = pages;

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	useEffect(
		() => () => {
			for (const page of pagesRef.current) {
				if (page.thumbnailUrl) {
					URL.revokeObjectURL(page.thumbnailUrl);
				}
			}
		},
		[],
	);

	const clearPages = useCallback(() => {
		setPages((current) => {
			for (const page of current) {
				if (page.thumbnailUrl) {
					URL.revokeObjectURL(page.thumbnailUrl);
				}
			}
			return [];
		});
	}, []);

	const addFiles = useCallback(
		async (files: File[]) => {
			const candidates = files.filter(isPdfFile);
			if (candidates.length === 0) {
				notify('warning', 'No PDF files found in that selection');
				return;
			}

			setProgress({ active: true, current: 0, total: candidates.length, label: 'Reading PDFs' });
			const loaded: ToolboxDoc[] = [];
			for (const [index, file] of candidates.entries()) {
				setProgress({ active: true, current: index, total: candidates.length, label: `Reading ${file.name}` });
				try {
					const { pageCount } = await inspectPdf(file);
					loaded.push({ id: nextId('doc'), file, name: file.name, size: file.size, pageCount });
				} catch (error) {
					notify('error', `Could not read ${file.name}`, describeError(error));
				}
			}
			setProgress(IDLE_PROGRESS);

			if (loaded.length > 0) {
				setDocs((current) => (mode === 'merge' ? [...current, ...loaded] : loaded.slice(0, 1)));
				clearPages();
				notify('success', `Added ${loaded.length} PDF${loaded.length === 1 ? '' : 's'}`);
			}
		},
		[clearPages, mode, notify],
	);

	const removeDoc = useCallback(
		(id: string) => {
			setDocs((current) => current.filter((doc) => doc.id !== id));
			clearPages();
		},
		[clearPages],
	);

	const clearAll = useCallback(() => {
		setDocs([]);
		clearPages();
	}, [clearPages]);

	const moveDoc = useCallback((id: string, direction: -1 | 1) => {
		setDocs((current) => {
			const index = current.findIndex((doc) => doc.id === id);
			const next = index + direction;
			if (index === -1 || next < 0 || next >= current.length) {
				return current;
			}
			return arrayMove(current, index, next);
		});
	}, []);

	const activeDoc = docs[0];

	// Build the page grid (with thumbnails) whenever the organise tool gets a document.
	useEffect(() => {
		if (mode !== 'organise' || !activeDoc) {
			return;
		}

		const controller = new AbortController();
		const created: string[] = [];
		let cancelled = false;

		setPages(
			Array.from({ length: activeDoc.pageCount }, (_, index) => ({
				id: `${activeDoc.id}-p${index + 1}`,
				pageNumber: index + 1,
				rotation: 0 as Rotation,
				deleted: false,
			})),
		);

		void renderPdfThumbnails(
			activeDoc.file,
			220,
			(pageNumber, url) => {
				// The effect may have been torn down between thumbnails.
				if (cancelled) {
					URL.revokeObjectURL(url);
					return;
				}
				created.push(url);
				setPages((current) =>
					current.map((page) =>
						page.pageNumber === pageNumber ? { ...page, thumbnailUrl: url } : page,
					),
				);
			},
			controller.signal,
		).catch(() => {
			// Thumbnails are decorative; failures leave placeholders in place.
		});

		return () => {
			cancelled = true;
			controller.abort();
			for (const url of created) {
				URL.revokeObjectURL(url);
			}
		};
	}, [activeDoc, mode]);

	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) {
			return;
		}
		setPages((current) => {
			const from = current.findIndex((page) => page.id === active.id);
			const to = current.findIndex((page) => page.id === over.id);
			return from === -1 || to === -1 ? current : arrayMove(current, from, to);
		});
	}, []);

	const rotatePage = useCallback((id: string, direction: 1 | -1) => {
		setPages((current) =>
			current.map((page) =>
				page.id === id
					? {
							...page,
							rotation:
								direction === 1 ? rotateClockwise(page.rotation) : rotateCounterClockwise(page.rotation),
						}
					: page,
			),
		);
	}, []);

	const togglePageDeleted = useCallback((id: string) => {
		setPages((current) =>
			current.map((page) => (page.id === id ? { ...page, deleted: !page.deleted } : page)),
		);
	}, []);

	const rotateAllPages = useCallback(() => {
		setPages((current) =>
			current.map((page) => ({ ...page, rotation: rotateClockwise(page.rotation) })),
		);
	}, []);

	const suggestedName = useMemo(() => {
		if (docs.length === 0) {
			return mode === 'merge' ? 'merged.pdf' : 'output.pdf';
		}
		if (mode === 'merge') {
			const shared = commonPrefix(docs.map((doc) => stripExtension(doc.name)));
			return `${shared.length >= 3 ? shared : 'merged'}.pdf`;
		}
		return `${stripExtension(docs[0].name)}-edited.pdf`;
	}, [docs, mode]);

	const splitPreview = useMemo(() => {
		if (!activeDoc) {
			return { count: 0, description: '' };
		}
		const groups = planSplit(split, activeDoc.pageCount);
		return {
			count: groups.length,
			description: groups
				.slice(0, 4)
				.map((group) =>
					group.length === 1 ? `${group[0]}` : `${group[0]}-${group[group.length - 1]}`,
				)
				.join(', '),
		};
	}, [activeDoc, split]);

	const keptPages = useMemo(() => pages.filter((page) => !page.deleted), [pages]);

	const runMerge = useCallback(async () => {
		if (docs.length < 2) {
			notify('warning', 'Add at least two PDFs to merge');
			return;
		}
		setBusy(true);
		setProgress({ active: true, current: 0, total: docs.length, label: 'Merging' });
		try {
			const result = await mergePdfs(
				docs.map((doc) => ({ file: doc.file })),
				outputName.trim() || suggestedName,
				(current, total, label) => setProgress({ active: true, current, total, label }),
			);
			downloadBlob(result.blob, result.fileName);
			notify('success', `Merged into ${result.fileName}`, `${result.pageCount} pages · ${formatBytes(result.blob.size)}`);
		} catch (error) {
			notify('error', 'Could not merge the PDFs', describeError(error));
		} finally {
			setBusy(false);
			setProgress(IDLE_PROGRESS);
		}
	}, [docs, notify, outputName, suggestedName]);

	const runSplit = useCallback(async () => {
		if (!activeDoc) {
			notify('warning', 'Add a PDF to split');
			return;
		}
		setBusy(true);
		setProgress({ active: true, current: 0, total: activeDoc.pageCount, label: 'Splitting' });
		try {
			const outputs = await splitPdf(activeDoc.file, split, (current, total, label) =>
				setProgress({ active: true, current, total, label }),
			);
			if (outputs.length === 1) {
				downloadBlob(outputs[0].blob, outputs[0].fileName);
			} else {
				await downloadAsZip(
					outputs.map((output) => ({ fileName: output.fileName, blob: output.blob })),
					`${stripExtension(activeDoc.name)}-split.zip`,
					(percent) =>
						setProgress({ active: true, current: Math.round(percent), total: 100, label: 'Building archive' }),
				);
			}
			notify('success', `Split into ${outputs.length} document${outputs.length === 1 ? '' : 's'}`);
		} catch (error) {
			notify('error', 'Could not split the PDF', describeError(error));
		} finally {
			setBusy(false);
			setProgress(IDLE_PROGRESS);
		}
	}, [activeDoc, notify, split]);

	const runOrganise = useCallback(async () => {
		if (!activeDoc) {
			notify('warning', 'Add a PDF to organise');
			return;
		}
		setBusy(true);
		setProgress({ active: true, current: 0, total: 1, label: 'Rebuilding document' });
		try {
			const result = await editPdfPages(
				activeDoc.file,
				pages.map(({ pageNumber, rotation, deleted }) => ({ pageNumber, rotation, deleted })),
				outputName.trim() || suggestedName,
			);
			downloadBlob(result.blob, result.fileName);
			notify('success', `Saved ${result.fileName}`, `${result.pageCount} pages · ${formatBytes(result.blob.size)}`);
		} catch (error) {
			notify('error', 'Could not rebuild the PDF', describeError(error));
		} finally {
			setBusy(false);
			setProgress(IDLE_PROGRESS);
		}
	}, [activeDoc, notify, outputName, pages, suggestedName]);

	const switchMode = useCallback(
		(next: ToolMode) => {
			setMode(next);
			clearPages();
			if (next !== 'merge') {
				setDocs((current) => current.slice(0, 1));
			}
		},
		[clearPages],
	);

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
			<div className="flex flex-col gap-4">
				<DropZone
					accept="application/pdf,.pdf"
					multiple={mode === 'merge'}
					onFiles={addFiles}
					compact={docs.length > 0}
					icon={<IconUpload className="size-8" />}
					title={mode === 'merge' ? 'Choose PDF files to merge' : 'Choose a PDF'}
					subtitle={
						mode === 'merge'
							? 'Documents are combined in the order listed below. Reorder them before merging.'
							: 'Only the first document is used by this tool.'
					}
				/>

				{docs.length > 0 ? (
					<div className="card p-4">
						<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
								{docs.length} document{docs.length === 1 ? '' : 's'}
							</h2>
							<Button size="sm" variant="danger" onClick={clearAll}>
								<IconTrash className="size-3.5" />
								Clear all
							</Button>
						</div>
						<ul className="flex flex-col gap-2">
							{docs.map((doc, index) => (
								<li
									key={doc.id}
									className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40"
								>
									<span className="w-5 shrink-0 text-center text-xs font-semibold text-slate-400 tabular-nums">
										{index + 1}
									</span>
									<IconFilePdf className="size-5 shrink-0 text-red-500" />
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
											{doc.name}
										</p>
										<p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
											{doc.pageCount} page{doc.pageCount === 1 ? '' : 's'} · {formatBytes(doc.size)}
										</p>
									</div>
									{mode === 'merge' ? (
										<>
											<IconButton
												label="Move up"
												disabled={index === 0}
												onClick={() => moveDoc(doc.id, -1)}
											>
												<span className="text-xs font-bold">↑</span>
											</IconButton>
											<IconButton
												label="Move down"
												disabled={index === docs.length - 1}
												onClick={() => moveDoc(doc.id, 1)}
											>
												<span className="text-xs font-bold">↓</span>
											</IconButton>
										</>
									) : null}
									<IconButton label={`Remove ${doc.name}`} onClick={() => removeDoc(doc.id)}>
										<IconTrash className="size-4 text-red-500" />
									</IconButton>
								</li>
							))}
						</ul>
					</div>
				) : null}

				<ProgressBar progress={progress} />

				{mode === 'organise' && pages.length > 0 ? (
					<div className="card p-4">
						<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
									{pages.length} page{pages.length === 1 ? '' : 's'}
								</h2>
								<span className="chip tabular-nums">{keptPages.length} kept</span>
							</div>
							<Button size="sm" onClick={rotateAllPages}>
								<IconRotateCw className="size-3.5" />
								Rotate all
							</Button>
						</div>
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							modifiers={[restrictToParentElement]}
							onDragEnd={handleDragEnd}
						>
							<SortableContext items={pages.map((page) => page.id)} strategy={rectSortingStrategy}>
								<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
									{pages.map((page, index) => (
										<SortablePageTile
											key={page.id}
											page={page}
											position={index + 1}
											onRotate={rotatePage}
											onToggleDeleted={togglePageDeleted}
										/>
									))}
								</ul>
							</SortableContext>
						</DndContext>
						<p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
							Drag to reorder, rotate individual pages, or mark pages for removal before saving.
						</p>
					</div>
				) : null}
			</div>

			<aside className="flex flex-col gap-4">
				<Section title="Tool" description="Pick what to do with your documents.">
					<SegmentedControl
						label="Mode"
						value={mode}
						options={[
							{ value: 'merge', label: 'Merge', title: 'Combine several PDFs into one' },
							{ value: 'split', label: 'Split', title: 'Break one PDF into several' },
							{ value: 'organise', label: 'Organise', title: 'Reorder, rotate and delete pages' },
						]}
						onChange={switchMode}
					/>
				</Section>

				{mode === 'split' ? (
					<Section title="Split settings" description="How the document is divided.">
						<div className="flex flex-col gap-3">
							<SelectField
								label="Split by"
								value={split.mode}
								options={[
									{ value: 'each', label: 'Every page separately' },
									{ value: 'every', label: 'Fixed number of pages' },
									{ value: 'ranges', label: 'Custom ranges' },
								]}
								onChange={(value) => setSplit((current) => ({ ...current, mode: value as SplitMode }))}
							/>
							{split.mode === 'every' ? (
								<NumberField
									label="Pages per document"
									min={1}
									max={500}
									value={split.chunkSize}
									onChange={(chunkSize) =>
										setSplit((current) => ({ ...current, chunkSize: Math.max(1, chunkSize) }))
									}
								/>
							) : null}
							{split.mode === 'ranges' ? (
								<TextField
									label="Ranges"
									value={split.ranges}
									placeholder="1-3; 4-6; 7-"
									onChange={(ranges) => setSplit((current) => ({ ...current, ranges }))}
									hint="Separate each output document with a semicolon."
								/>
							) : null}
							{activeDoc ? (
								<p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
									Produces {splitPreview.count} document{splitPreview.count === 1 ? '' : 's'}
									{splitPreview.description ? ` · ${splitPreview.description}${splitPreview.count > 4 ? ', …' : ''}` : ''}
								</p>
							) : null}
						</div>
					</Section>
				) : (
					<Section title="Output" description="Name of the file you will download.">
						<TextField
							label="File name"
							value={outputName}
							placeholder={suggestedName}
							onChange={setOutputName}
						/>
					</Section>
				)}

				<div className="sticky bottom-0 -mx-1 flex flex-col gap-2 rounded-t-2xl border-t border-slate-200 bg-slate-50/95 px-1 pt-3 pb-3 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95">
					{mode === 'merge' ? (
						<Button
							variant="primary"
							size="lg"
							className="w-full"
							disabled={docs.length < 2 || busy}
							onClick={runMerge}
						>
							<IconMerge className="size-4" />
							{busy ? 'Merging…' : `Merge ${docs.length || ''} PDFs`}
						</Button>
					) : null}
					{mode === 'split' ? (
						<Button
							variant="primary"
							size="lg"
							className="w-full"
							disabled={!activeDoc || busy || splitPreview.count === 0}
							onClick={runSplit}
						>
							<IconScissors className="size-4" />
							{busy ? 'Splitting…' : `Split into ${splitPreview.count || 0} files`}
						</Button>
					) : null}
					{mode === 'organise' ? (
						<Button
							variant="primary"
							size="lg"
							className="w-full"
							disabled={!activeDoc || busy || keptPages.length === 0}
							onClick={runOrganise}
						>
							<IconDownload className="size-4" />
							{busy ? 'Saving…' : `Save ${keptPages.length} page${keptPages.length === 1 ? '' : 's'}`}
						</Button>
					) : null}
				</div>
			</aside>
		</div>
	);
}

function SortablePageTile({
	page,
	position,
	onRotate,
	onToggleDeleted,
}: {
	page: EditablePage;
	position: number;
	onRotate: (id: string, direction: 1 | -1) => void;
	onToggleDeleted: (id: string) => void;
}) {
	const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
		useSortable({ id: page.id });

	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={`group relative flex flex-col overflow-hidden rounded-xl border bg-white transition dark:bg-slate-900 ${
				isDragging
					? 'z-10 border-brand-500 opacity-90 shadow-lg'
					: page.deleted
						? 'border-red-300 opacity-50 dark:border-red-900'
						: 'border-slate-200 shadow-sm dark:border-slate-800'
			}`}
		>
			<div className="relative flex h-36 items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-800">
				{page.thumbnailUrl ? (
					<img
						src={page.thumbnailUrl}
						alt={`Page ${page.pageNumber}`}
						loading="lazy"
						decoding="async"
						className="max-h-full max-w-full object-contain shadow-sm transition-transform"
						style={{ transform: `rotate(${page.rotation}deg)` }}
					/>
				) : (
					<IconFilePdf className="size-8 animate-pulse text-slate-300 dark:text-slate-600" />
				)}
				<span className="absolute top-1.5 left-1.5 rounded-md bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
					{position} · p{page.pageNumber}
				</span>
				<button
					ref={setActivatorNodeRef}
					type="button"
					aria-label={`Reorder page ${page.pageNumber}`}
					className="absolute top-1.5 right-1.5 cursor-grab rounded-md bg-slate-900/75 p-1 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
					{...attributes}
					{...listeners}
				>
					<IconGrip className="size-3.5" />
				</button>
				{page.deleted ? (
					<span className="absolute inset-x-0 bottom-0 bg-red-600/90 py-0.5 text-center text-[10px] font-bold text-white">
						REMOVED
					</span>
				) : null}
			</div>
			<div className="flex items-center justify-end gap-0.5 p-1.5">
				<IconButton label="Rotate left" onClick={() => onRotate(page.id, -1)}>
					<IconRotateCcw className="size-4" />
				</IconButton>
				<IconButton label="Rotate right" onClick={() => onRotate(page.id, 1)}>
					<IconRotateCw className="size-4" />
				</IconButton>
				<IconButton
					label={page.deleted ? 'Restore page' : 'Remove page'}
					onClick={() => onToggleDeleted(page.id)}
				>
					<IconTrash className={`size-4 ${page.deleted ? 'text-slate-400' : 'text-red-500'}`} />
				</IconButton>
			</div>
		</li>
	);
}
