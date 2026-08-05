import {
	PDFDocument,
	clip,
	closePath,
	endPath,
	lineTo,
	moveTo,
	popGraphicsState,
	pushGraphicsState,
	rgb,
	type PDFImage,
} from 'pdf-lib';
import type { ImageItem, PdfBuildOptions } from './types';
import { chunk, fitRect, gridCells, type Box } from './layout';
import { mmToPoints, resolvePageSize } from './pageSizes';
import { parseHexColor, sanitizeFileName, withExtension } from './format';
import { prepareImageForPdf } from './images';

export interface BuildPdfResult {
	blob: Blob;
	fileName: string;
	pageCount: number;
	byteLength: number;
}

export interface BuildPdfProgress {
	(completed: number, total: number, label: string): void;
}

export const DEFAULT_PDF_OPTIONS: PdfBuildOptions = {
	pageSizeId: 'auto',
	customWidthMm: 210,
	customHeightMm: 297,
	orientation: 'auto',
	marginMm: 0,
	fit: 'contain',
	backgroundColor: '#ffffff',
	compress: false,
	jpegQuality: 0.85,
	maxDimension: 0,
	imagesPerPage: 1,
	title: '',
	author: '',
	subject: '',
	keywords: '',
	fileName: 'pixelpress.pdf',
};

/** Convert an ordered list of images into a single PDF document. */
export async function buildPdfFromImages(
	items: readonly ImageItem[],
	options: PdfBuildOptions,
	onProgress?: BuildPdfProgress,
	signal?: AbortSignal,
): Promise<BuildPdfResult> {
	if (items.length === 0) {
		throw new Error('Add at least one image before creating a PDF');
	}

	const pdf = await PDFDocument.create();
	applyMetadata(pdf, options);

	const margin = mmToPoints(Math.max(0, options.marginMm));
	const background = parseHexColor(options.backgroundColor);
	const perPage = options.imagesPerPage;
	const groups = chunk(items, perPage);
	const total = items.length;
	let completed = 0;

	for (const group of groups) {
		throwIfAborted(signal);

		const embedded: Array<{ image: PDFImage; width: number; height: number }> = [];
		for (const item of group) {
			throwIfAborted(signal);
			onProgress?.(completed, total, `Encoding ${item.name}`);
			const raster = await prepareImageForPdf(item, {
				compress: options.compress,
				jpegQuality: options.jpegQuality,
				maxDimension: options.maxDimension,
				backgroundColor: options.backgroundColor,
			});
			const image =
				raster.type === 'image/png'
					? await pdf.embedPng(raster.bytes)
					: await pdf.embedJpg(raster.bytes);
			embedded.push({ image, width: raster.width, height: raster.height });
			completed += 1;
			onProgress?.(completed, total, `Encoding ${item.name}`);
		}

		const first = embedded[0];
		const aspect = first.width / first.height;
		const explicitSize = resolvePageSize(
			options.pageSizeId,
			options.orientation,
			options.customWidthMm,
			options.customHeightMm,
			aspect,
		);

		const pageSize =
			explicitSize ??
			autoPageSize(first.width, first.height, margin, perPage, options);

		const page = pdf.addPage([pageSize.width, pageSize.height]);
		page.drawRectangle({
			x: 0,
			y: 0,
			width: pageSize.width,
			height: pageSize.height,
			color: rgb(background.r, background.g, background.b),
		});

		const cells =
			perPage === 1
				? [
						{
							x: margin,
							y: margin,
							width: Math.max(1, pageSize.width - margin * 2),
							height: Math.max(1, pageSize.height - margin * 2),
						},
					]
				: gridCells(pageSize.width, pageSize.height, margin, perPage, margin > 0 ? margin / 2 : 6);

		embedded.forEach((entry, index) => {
			const cell = cells[index] ?? cells[cells.length - 1];
			const placement = fitRect(entry.width, entry.height, cell.width, cell.height, options.fit);
			// `cover` overflows the cell, so clip it back to the cell bounds.
			const needsClip = options.fit === 'cover';
			if (needsClip) {
				page.pushOperators(pushGraphicsState(), ...clipRectOperators(cell));
			}
			page.drawImage(entry.image, {
				x: cell.x + placement.x,
				y: cell.y + placement.y,
				width: placement.width,
				height: placement.height,
			});
			if (needsClip) {
				page.pushOperators(popGraphicsState());
			}
		});
	}

	throwIfAborted(signal);
	onProgress?.(total, total, 'Writing PDF');
	const bytes = await pdf.save({ useObjectStreams: true });
	const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });

	return {
		blob,
		fileName: withExtension(sanitizeFileName(options.fileName || 'pixelpress'), '.pdf'),
		pageCount: groups.length,
		byteLength: blob.size,
	};
}

/** Operators that restrict drawing to the given rectangle. */
function clipRectOperators(box: Box) {
	return [
		moveTo(box.x, box.y),
		lineTo(box.x + box.width, box.y),
		lineTo(box.x + box.width, box.y + box.height),
		lineTo(box.x, box.y + box.height),
		closePath(),
		clip(),
		endPath(),
	];
}

/** Page size that hugs the image, expanded to make room for margins. */
function autoPageSize(
	imageWidth: number,
	imageHeight: number,
	margin: number,
	perPage: number,
	options: PdfBuildOptions,
): { width: number; height: number } {
	if (perPage > 1) {
		// Grids need a fixed canvas; fall back to A4 in the requested orientation.
		return (
			resolvePageSize('a4', options.orientation, 210, 297, imageWidth / imageHeight) ?? {
				width: mmToPoints(210),
				height: mmToPoints(297),
			}
		);
	}
	return {
		width: Math.max(1, imageWidth + margin * 2),
		height: Math.max(1, imageHeight + margin * 2),
	};
}

function applyMetadata(pdf: PDFDocument, options: PdfBuildOptions): void {
	// pdf-lib always stamps its own /Producer on save, so only /Creator is ours.
	pdf.setCreator('PixelPress · https://github.com/Yoyokrazy/pixelpress');
	pdf.setCreationDate(new Date());
	pdf.setModificationDate(new Date());
	if (options.title.trim()) {
		pdf.setTitle(options.title.trim());
	}
	if (options.author.trim()) {
		pdf.setAuthor(options.author.trim());
	}
	if (options.subject.trim()) {
		pdf.setSubject(options.subject.trim());
	}
	const keywords = options.keywords
		.split(',')
		.map((keyword) => keyword.trim())
		.filter(Boolean);
	if (keywords.length > 0) {
		pdf.setKeywords(keywords);
	}
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException('Conversion cancelled', 'AbortError');
	}
}
