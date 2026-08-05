import { PDFDocument, degrees } from 'pdf-lib';
import { sanitizeFileName, stripExtension, withExtension } from './format';
import { parsePageRange } from './pageRange';
import type { Rotation } from './types';

export interface PdfSource {
	file: File;
	/** Page numbers to take, 1-based. Empty means every page. */
	pages?: number[];
}

export interface PdfToolProgress {
	(completed: number, total: number, label: string): void;
}

export interface PdfOutput {
	blob: Blob;
	fileName: string;
	pageCount: number;
}

/**
 * Merge several PDFs into one, honouring each source's page selection and the
 * order in which the documents were supplied.
 */
export async function mergePdfs(
	sources: readonly PdfSource[],
	fileName: string,
	onProgress?: PdfToolProgress,
): Promise<PdfOutput> {
	if (sources.length === 0) {
		throw new Error('Add at least one PDF to merge');
	}

	const merged = await PDFDocument.create();
	merged.setCreator('PixelPress · https://github.com/Yoyokrazy/pixelpress');
	merged.setCreationDate(new Date());

	for (const [index, source] of sources.entries()) {
		onProgress?.(index, sources.length, `Merging ${source.file.name}`);
		const donor = await PDFDocument.load(await source.file.arrayBuffer(), {
			ignoreEncryption: true,
		});
		const indices =
			source.pages && source.pages.length > 0
				? source.pages
						.filter((page) => page >= 1 && page <= donor.getPageCount())
						.map((page) => page - 1)
				: donor.getPageIndices();
		const copied = await merged.copyPages(donor, indices);
		for (const page of copied) {
			merged.addPage(page);
		}
	}

	onProgress?.(sources.length, sources.length, 'Writing PDF');
	const bytes = await merged.save({ useObjectStreams: true });
	return {
		blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
		fileName: withExtension(sanitizeFileName(fileName || 'merged'), '.pdf'),
		pageCount: merged.getPageCount(),
	};
}

export type SplitMode = 'each' | 'every' | 'ranges';

export interface SplitOptions {
	mode: SplitMode;
	/** Pages per output document when mode is `every`. */
	chunkSize: number;
	/** Semicolon-separated range expressions when mode is `ranges`, e.g. "1-3; 4-6". */
	ranges: string;
}

/** Break a PDF into several smaller documents. */
export async function splitPdf(
	file: File,
	options: SplitOptions,
	onProgress?: PdfToolProgress,
): Promise<PdfOutput[]> {
	const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
	const pageCount = source.getPageCount();
	const baseName = stripExtension(file.name);
	const groups = planSplit(options, pageCount);

	if (groups.length === 0) {
		throw new Error('The split settings did not select any pages');
	}

	const outputs: PdfOutput[] = [];
	const width = String(groups.length).length;

	for (const [index, pages] of groups.entries()) {
		onProgress?.(index, groups.length, `Writing part ${index + 1}`);
		const target = await PDFDocument.create();
		target.setCreator('PixelPress · https://github.com/Yoyokrazy/pixelpress');
		const copied = await target.copyPages(
			source,
			pages.map((page) => page - 1),
		);
		for (const page of copied) {
			target.addPage(page);
		}
		const bytes = await target.save({ useObjectStreams: true });
		const suffix =
			pages.length === 1
				? `p${pages[0]}`
				: `p${pages[0]}-${pages[pages.length - 1]}`;
		outputs.push({
			blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
			fileName: `${sanitizeFileName(baseName)}-${String(index + 1).padStart(width, '0')}-${suffix}.pdf`,
			pageCount: pages.length,
		});
	}

	onProgress?.(groups.length, groups.length, 'Done');
	return outputs;
}

/** Work out which pages land in each output document. */
export function planSplit(options: SplitOptions, pageCount: number): number[][] {
	if (pageCount <= 0) {
		return [];
	}

	if (options.mode === 'each') {
		return Array.from({ length: pageCount }, (_, index) => [index + 1]);
	}

	if (options.mode === 'every') {
		const size = Math.max(1, Math.floor(options.chunkSize));
		const groups: number[][] = [];
		for (let start = 1; start <= pageCount; start += size) {
			groups.push(
				Array.from({ length: Math.min(size, pageCount - start + 1) }, (_, offset) => start + offset),
			);
		}
		return groups;
	}

	return options.ranges
		.split(';')
		.map((expression) => expression.trim())
		.filter((expression) => expression.length > 0)
		.map((expression) => parsePageRange(expression, pageCount).pages)
		.filter((pages) => pages.length > 0);
}

export interface PageEdit {
	/** 1-based page number in the source document. */
	pageNumber: number;
	rotation: Rotation;
	deleted: boolean;
}

/**
 * Rewrite a PDF with pages reordered, rotated or removed. `edits` is applied in
 * order, so moving an entry moves the corresponding page.
 */
export async function editPdfPages(
	file: File,
	edits: readonly PageEdit[],
	fileName?: string,
): Promise<PdfOutput> {
	const kept = edits.filter((edit) => !edit.deleted);
	if (kept.length === 0) {
		throw new Error('At least one page must remain');
	}

	const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
	const target = await PDFDocument.create();
	target.setCreator('PixelPress · https://github.com/Yoyokrazy/pixelpress');

	const copied = await target.copyPages(
		source,
		kept.map((edit) => edit.pageNumber - 1),
	);
	copied.forEach((page, index) => {
		const edit = kept[index];
		if (edit.rotation !== 0) {
			// pdf-lib rotations are absolute, so fold the existing angle in.
			const current = page.getRotation().angle;
			page.setRotation(degrees((current + edit.rotation) % 360));
		}
		target.addPage(page);
	});

	const bytes = await target.save({ useObjectStreams: true });
	return {
		blob: new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }),
		fileName: withExtension(
			sanitizeFileName(fileName || `${stripExtension(file.name)}-edited`),
			'.pdf',
		),
		pageCount: kept.length,
	};
}

/** Read the page count and per-page size of a PDF without rendering it. */
export async function inspectPdf(
	file: File,
): Promise<{ pageCount: number; sizes: Array<{ width: number; height: number }> }> {
	const pdf = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
	return {
		pageCount: pdf.getPageCount(),
		sizes: pdf.getPages().map((page) => page.getSize()),
	};
}
