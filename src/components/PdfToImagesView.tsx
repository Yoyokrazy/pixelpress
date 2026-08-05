import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PdfItem, ProgressState, RasterizeOptions, RenderedPage } from '../lib/types';
import { IDLE_PROGRESS } from '../lib/types';
import { isPdfFile, nextId } from '../lib/images';
import {
	DEFAULT_RASTERIZE_OPTIONS,
	DPI_PRESETS,
	PdfPasswordRequiredError,
	describeError,
	rasterizePdfs,
	readPdfPageCount,
} from '../lib/pdfToImages';
import { downloadAsZip, downloadBlob } from '../lib/download';
import { commonPrefix, formatBytes, stripExtension } from '../lib/format';
import { formatPageRange, parsePageRange } from '../lib/pageRange';
import { usePersistentState } from '../hooks/usePersistentState';
import { DropZone } from './DropZone';
import { PageCard } from './PageCard';
import { ProgressBar } from './ProgressBar';
import { Button, IconButton } from './Button';
import {
	SegmentedControl,
	Section,
	SelectField,
	SliderField,
	TextField,
	ToggleField,
} from './fields';
import {
	IconDownload,
	IconFilePdf,
	IconLock,
	IconSelectAll,
	IconTrash,
	IconUpload,
} from './icons';

interface PdfToImagesViewProps {
	notify: (kind: 'success' | 'error' | 'info' | 'warning', message: string, detail?: string) => void;
}

export function PdfToImagesView({ notify }: PdfToImagesViewProps) {
	const [pdfs, setPdfs] = useState<PdfItem[]>([]);
	const [pages, setPages] = useState<RenderedPage[]>([]);
	const [options, updateOptions, resetOptions] = usePersistentState<RasterizeOptions>(
		'pixelpress:raster-options',
		DEFAULT_RASTERIZE_OPTIONS,
	);
	const [progress, setProgress] = useState<ProgressState>(IDLE_PROGRESS);
	const [busy, setBusy] = useState(false);
	const [passwordPrompt, setPasswordPrompt] = useState<{ file: File; retry: boolean } | null>(null);
	const [passwordDraft, setPasswordDraft] = useState('');
	const abortRef = useRef<AbortController | null>(null);
	const pagesRef = useRef<RenderedPage[]>([]);

	pagesRef.current = pages;

	// Release rendered page object URLs when the view unmounts.
	useEffect(
		() => () => {
			for (const page of pagesRef.current) {
				URL.revokeObjectURL(page.url);
			}
		},
		[],
	);

	const registerPdf = useCallback(
		async (file: File, password?: string) => {
			try {
				const pageCount = await readPdfPageCount(file, password);
				setPdfs((current) => [
					...current.filter((item) => !(item.name === file.name && item.size === file.size)),
					{ id: nextId('pdf'), file, name: file.name, size: file.size, pageCount, password },
				]);
				return true;
			} catch (error) {
				if (error instanceof PdfPasswordRequiredError) {
					setPasswordPrompt({ file, retry: error.wrongPassword });
					setPasswordDraft('');
					return false;
				}
				notify('error', `Could not open ${file.name}`, describeError(error));
				return false;
			}
		},
		[notify],
	);

	const addFiles = useCallback(
		async (files: File[]) => {
			const candidates = files.filter(isPdfFile);
			const skipped = files.length - candidates.length;
			if (candidates.length === 0) {
				notify('warning', 'No PDF files found in that selection');
				return;
			}

			setProgress({ active: true, current: 0, total: candidates.length, label: 'Reading PDFs' });
			let added = 0;
			for (const [index, file] of candidates.entries()) {
				setProgress({ active: true, current: index, total: candidates.length, label: `Reading ${file.name}` });
				if (await registerPdf(file)) {
					added += 1;
				}
			}
			setProgress(IDLE_PROGRESS);

			if (added > 0) {
				notify('success', `Added ${added} PDF${added === 1 ? '' : 's'}`);
			}
			if (skipped > 0) {
				notify('info', `Ignored ${skipped} non-PDF file${skipped === 1 ? '' : 's'}`);
			}
		},
		[notify, registerPdf],
	);

	const submitPassword = useCallback(async () => {
		if (!passwordPrompt) {
			return;
		}
		const { file } = passwordPrompt;
		setPasswordPrompt(null);
		const unlocked = await registerPdf(file, passwordDraft);
		if (unlocked) {
			notify('success', `Unlocked ${file.name}`);
		}
		setPasswordDraft('');
	}, [notify, passwordDraft, passwordPrompt, registerPdf]);

	const removePdf = useCallback((id: string) => {
		setPdfs((current) => current.filter((item) => item.id !== id));
		setPages((current) => {
			const keep: RenderedPage[] = [];
			for (const page of current) {
				if (page.sourceId === id) {
					URL.revokeObjectURL(page.url);
				} else {
					keep.push(page);
				}
			}
			return keep;
		});
	}, []);

	const clearPages = useCallback(() => {
		setPages((current) => {
			for (const page of current) {
				URL.revokeObjectURL(page.url);
			}
			return [];
		});
	}, []);

	const clearAll = useCallback(() => {
		clearPages();
		setPdfs([]);
	}, [clearPages]);

	const totalPageCount = useMemo(() => pdfs.reduce((sum, pdf) => sum + pdf.pageCount, 0), [pdfs]);
	const maxPageCount = useMemo(
		() => pdfs.reduce((max, pdf) => Math.max(max, pdf.pageCount), 0),
		[pdfs],
	);

	const rangePreview = useMemo(() => {
		if (maxPageCount === 0) {
			return { text: '', errors: [] as string[], count: 0 };
		}
		const { pages: selected, errors } = parsePageRange(options.pageRange, maxPageCount);
		return { text: formatPageRange(selected), errors, count: selected.length };
	}, [maxPageCount, options.pageRange]);

	const selectedPages = useMemo(() => pages.filter((page) => page.selected), [pages]);

	const convert = useCallback(async () => {
		if (pdfs.length === 0) {
			notify('warning', 'Add a PDF first');
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;
		setBusy(true);
		clearPages();
		setProgress({ active: true, current: 0, total: totalPageCount, label: 'Rendering pages' });
		const startedAt = performance.now();

		try {
			const { pages: rendered, errors } = await rasterizePdfs(
				pdfs.map((pdf) => ({ file: pdf.file, sourceId: pdf.id, password: pdf.password })),
				options,
				(current, total, label) => setProgress({ active: true, current, total, label }),
				controller.signal,
			);
			setPages(rendered);

			if (rendered.length > 0) {
				const bytes = rendered.reduce((sum, page) => sum + page.blob.size, 0);
				notify(
					'success',
					`Rendered ${rendered.length} page${rendered.length === 1 ? '' : 's'}`,
					`${formatBytes(bytes)} · ${Math.round(performance.now() - startedAt)} ms`,
				);
			}
			if (errors.length > 0) {
				notify('warning', `${errors.length} page${errors.length === 1 ? '' : 's'} had problems`, errors.slice(0, 3).join(' · '));
			}
			if (rendered.length === 0 && errors.length === 0) {
				notify('warning', 'Nothing matched the selected page range');
			}
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') {
				notify('info', 'Conversion cancelled');
			} else {
				notify('error', 'Could not render the PDF', describeError(error));
			}
		} finally {
			abortRef.current = null;
			setBusy(false);
			setProgress(IDLE_PROGRESS);
		}
	}, [clearPages, notify, options, pdfs, totalPageCount]);

	const downloadAll = useCallback(async () => {
		if (selectedPages.length === 0) {
			notify('warning', 'Select at least one page');
			return;
		}
		if (selectedPages.length === 1) {
			downloadBlob(selectedPages[0].blob, selectedPages[0].fileName);
			notify('success', `Saved ${selectedPages[0].fileName}`);
			return;
		}

		const base = commonPrefix(pdfs.map((pdf) => stripExtension(pdf.name)));
		const zipName = `${base.length >= 3 ? base : 'pixelpress-pages'}.zip`;
		setProgress({ active: true, current: 0, total: 100, label: 'Building archive' });
		try {
			const blob = await downloadAsZip(
				selectedPages.map((page) => ({ fileName: page.fileName, blob: page.blob })),
				zipName,
				(percent) =>
					setProgress({ active: true, current: Math.round(percent), total: 100, label: 'Building archive' }),
			);
			notify('success', `Saved ${zipName}`, `${selectedPages.length} images · ${formatBytes(blob.size)}`);
		} catch (error) {
			notify('error', 'Could not build the archive', describeError(error));
		} finally {
			setProgress(IDLE_PROGRESS);
		}
	}, [notify, pdfs, selectedPages]);

	const togglePage = useCallback((id: string) => {
		setPages((current) =>
			current.map((page) => (page.id === id ? { ...page, selected: !page.selected } : page)),
		);
	}, []);

	const setAllSelected = useCallback((selected: boolean) => {
		setPages((current) => current.map((page) => ({ ...page, selected })));
	}, []);

	const lossy = options.format !== 'png';

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
			<div className="flex flex-col gap-4">
				<DropZone
					accept="application/pdf,.pdf"
					onFiles={addFiles}
					compact={pdfs.length > 0}
					icon={<IconUpload className="size-8" />}
					title="Choose PDF files"
					subtitle="or drop PDFs here. Encrypted documents will prompt for a password. Nothing is uploaded anywhere."
				/>

				{pdfs.length > 0 ? (
					<div className="card p-4">
						<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
							<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
								{pdfs.length} document{pdfs.length === 1 ? '' : 's'} · {totalPageCount} page
								{totalPageCount === 1 ? '' : 's'}
							</h2>
							<Button size="sm" variant="danger" onClick={clearAll}>
								<IconTrash className="size-3.5" />
								Clear all
							</Button>
						</div>
						<ul className="flex flex-col gap-2">
							{pdfs.map((pdf) => (
								<li
									key={pdf.id}
									className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40"
								>
									<IconFilePdf className="size-5 shrink-0 text-red-500" />
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
											{pdf.name}
										</p>
										<p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
											{pdf.pageCount} page{pdf.pageCount === 1 ? '' : 's'} · {formatBytes(pdf.size)}
											{pdf.password ? ' · unlocked' : ''}
										</p>
									</div>
									{pdf.password ? <IconLock className="size-4 text-amber-500" /> : null}
									<IconButton label={`Remove ${pdf.name}`} onClick={() => removePdf(pdf.id)}>
										<IconTrash className="size-4 text-red-500" />
									</IconButton>
								</li>
							))}
						</ul>
					</div>
				) : null}

				<ProgressBar progress={progress} onCancel={busy ? () => abortRef.current?.abort() : undefined} />

				{pages.length > 0 ? (
					<div className="card p-4">
						<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
									{pages.length} image{pages.length === 1 ? '' : 's'}
								</h2>
								<span className="chip tabular-nums">{selectedPages.length} selected</span>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Button size="sm" onClick={() => setAllSelected(true)}>
									<IconSelectAll className="size-3.5" />
									Select all
								</Button>
								<Button size="sm" onClick={() => setAllSelected(false)}>
									Deselect all
								</Button>
								<Button size="sm" variant="danger" onClick={clearPages}>
									<IconTrash className="size-3.5" />
									Clear
								</Button>
							</div>
						</div>
						<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
							{pages.map((page) => (
								<PageCard
									key={page.id}
									page={page}
									onToggle={togglePage}
									onDownload={(target) => downloadBlob(target.blob, target.fileName)}
								/>
							))}
						</ul>
					</div>
				) : pdfs.length > 0 ? (
					<div className="card flex flex-col items-center gap-2 p-10 text-center">
						<IconFilePdf className="size-10 text-slate-300 dark:text-slate-700" />
						<p className="text-sm font-medium text-slate-600 dark:text-slate-300">Ready to render</p>
						<p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
							Pick a format and resolution, then run the conversion to preview every page.
						</p>
					</div>
				) : null}
			</div>

			<aside className="flex flex-col gap-4">
				<Section title="Output" description="Format and resolution of the exported images.">
					<div className="flex flex-col gap-3">
						<SegmentedControl
							label="Format"
							value={options.format}
							options={[
								{ value: 'png', label: 'PNG', title: 'Lossless, supports transparency' },
								{ value: 'jpeg', label: 'JPEG', title: 'Smaller files, no transparency' },
								{ value: 'webp', label: 'WebP', title: 'Modern format, small and sharp' },
							]}
							onChange={(format) => updateOptions({ format })}
						/>
						<SelectField
							label="Resolution"
							value={options.dpi}
							options={DPI_PRESETS.map((dpi) => ({
								value: dpi,
								label: `${dpi} DPI${dpi === 150 ? ' (recommended)' : dpi === 72 ? ' (screen)' : dpi >= 300 ? ' (print)' : ''}`,
							}))}
							onChange={(dpi) => updateOptions({ dpi })}
							hint="Higher DPI means sharper images and larger files."
						/>
						<SliderField
							label="Quality"
							min={0.3}
							max={1}
							step={0.05}
							value={options.quality}
							disabled={!lossy}
							format={(value) => `${Math.round(value * 100)}%`}
							onChange={(quality) => updateOptions({ quality })}
						/>
						<ToggleField
							label="Transparent background"
							hint="PNG only. Keeps areas the page does not paint transparent."
							checked={options.transparent}
							disabled={options.format !== 'png'}
							onChange={(transparent) => updateOptions({ transparent })}
						/>
					</div>
				</Section>

				<Section title="Pages" description="Choose which pages to render.">
					<div className="flex flex-col gap-3">
						<TextField
							label="Page range"
							value={options.pageRange}
							placeholder="e.g. 1-3, 5, 8- (blank = all)"
							invalid={rangePreview.errors.length > 0}
							onChange={(pageRange) => updateOptions({ pageRange })}
							hint={
								rangePreview.errors.length > 0
									? rangePreview.errors[0]
									: maxPageCount > 0
										? `${rangePreview.count} page${rangePreview.count === 1 ? '' : 's'} per document${rangePreview.text ? `: ${rangePreview.text}` : ''}`
										: 'Supports ranges, lists and the keywords all, odd, even, first, last.'
							}
						/>
						<div className="flex flex-wrap gap-1.5">
							{['', 'first', 'last', 'odd', 'even'].map((preset) => (
								<button
									key={preset || 'all'}
									type="button"
									onClick={() => updateOptions({ pageRange: preset })}
									className="chip cursor-pointer transition hover:bg-brand-100 hover:text-brand-800 dark:hover:bg-brand-900 dark:hover:text-brand-200"
								>
									{preset || 'all'}
								</button>
							))}
						</div>
						<TextField
							label="File name pattern"
							value={options.fileNamePattern}
							placeholder="{name}-{page}"
							onChange={(fileNamePattern) => updateOptions({ fileNamePattern })}
							hint="Tokens: {name} {page} {index} {total} {pageCount}. Pad with {page:3}."
						/>
					</div>
				</Section>

				<div className="sticky bottom-4 flex flex-col gap-2">
					<Button
						variant="primary"
						size="lg"
						disabled={pdfs.length === 0 || busy}
						onClick={convert}
						className="w-full"
					>
						{busy ? 'Rendering…' : 'Convert to images'}
					</Button>
					<Button
						size="lg"
						disabled={selectedPages.length === 0 || busy}
						onClick={downloadAll}
						className="w-full"
					>
						<IconDownload className="size-4" />
						{selectedPages.length > 1
							? `Download ${selectedPages.length} as ZIP`
							: 'Download image'}
					</Button>
					<Button size="sm" variant="ghost" onClick={resetOptions} className="w-full">
						Reset settings to defaults
					</Button>
				</div>
			</aside>

			{passwordPrompt ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
					<div className="card w-full max-w-sm p-5">
						<div className="mb-3 flex items-center gap-2">
							<IconLock className="size-5 text-amber-500" />
							<h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
								Password required
							</h3>
						</div>
						<p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
							{passwordPrompt.retry ? 'That password was not correct. ' : ''}
							<span className="font-medium text-slate-700 dark:text-slate-300">
								{passwordPrompt.file.name}
							</span>{' '}
							is encrypted. The password stays in this browser tab.
						</p>
						<form
							onSubmit={(event) => {
								event.preventDefault();
								void submitPassword();
							}}
						>
							<input
								type="password"
								autoFocus
								className="field-control"
								value={passwordDraft}
								placeholder="Document password"
								onChange={(event) => setPasswordDraft(event.target.value)}
							/>
							<div className="mt-4 flex justify-end gap-2">
								<Button
									onClick={() => {
										setPasswordPrompt(null);
										setPasswordDraft('');
									}}
								>
									Cancel
								</Button>
								<Button type="submit" variant="primary">
									Unlock
								</Button>
							</div>
						</form>
					</div>
				</div>
			) : null}
		</div>
	);
}
