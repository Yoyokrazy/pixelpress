import { PDFDocument } from 'pdf-lib';
import { canvasToBlob, createCanvas } from './images';
import { POINTS_PER_INCH } from './pageSizes';
import { sanitizeFileName, stripExtension, withExtension } from './format';

/**
 * "Compress" a PDF by rasterising every page at a chosen DPI and re-encoding it
 * as a JPEG-backed page of the same physical size. This is the pragmatic
 * browser approach: it does not downsample the internal image streams in place
 * (pdf-lib cannot), it flattens each page to a single image. That discards text
 * selectability but shrinks image-heavy and scanned documents dramatically.
 *
 * The render loop needs canvas and the pdf.js worker, so it is verified in a
 * real browser rather than jsdom (see pdfToImages.ts for the same rationale);
 * the pure helpers below are unit tested.
 */

export interface CompressPdfOptions {
	/** Dots per inch used to rasterise each page. Lower = smaller output. */
	dpi: number;
	/** JPEG quality (0-1) for the rasterised pages. */
	quality: number;
}

export const DEFAULT_COMPRESS_OPTIONS: CompressPdfOptions = {
	dpi: 150,
	quality: 0.7,
};

export const COMPRESS_DPI_PRESETS = [72, 96, 150, 200, 300] as const;

export interface CompressResult {
	blob: Blob;
	fileName: string;
	pageCount: number;
	byteLength: number;
}

export interface CompressProgress {
	(completed: number, total: number, label: string): void;
}

/** PDF user space is 72dpi, so the raster scale is the requested DPI over 72. */
export function dpiToScale(dpi: number): number {
	if (!Number.isFinite(dpi) || dpi <= 0) {
		return 1;
	}
	return dpi / POINTS_PER_INCH;
}

/** Name for the compressed output, e.g. `report.pdf` → `report-compressed.pdf`. */
export function compressedFileName(originalName: string): string {
	return withExtension(sanitizeFileName(`${stripExtension(originalName)}-compressed`), '.pdf');
}

/**
 * Fraction of bytes saved versus the original, clamped so a document that grew
 * reports 0 rather than a negative "saving".
 */
export function compressionSavings(originalBytes: number, newBytes: number): number {
	if (originalBytes <= 0) {
		return 0;
	}
	return Math.max(0, 1 - newBytes / originalBytes);
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new DOMException('Compression cancelled', 'AbortError');
	}
}

/** Rasterise and re-encode a PDF into a smaller, image-only document. */
export async function compressPdf(
	file: File,
	options: CompressPdfOptions,
	onProgress?: CompressProgress,
	signal?: AbortSignal,
	password?: string,
): Promise<CompressResult> {
	const buffer = await file.arrayBuffer();
	// Imported dynamically so this module (and its pure helpers) can load in
	// jsdom for unit tests — pdf.js references browser-only globals on import.
	const { openPdf, closePdf } = await import('./pdfToImages');
	const source = await openPdf(buffer, password);
	const total = source.numPages;
	const scale = dpiToScale(options.dpi);

	try {
		const out = await PDFDocument.create();
		out.setCreator('PixelPress · https://github.com/Yoyokrazy/pixelpress');
		out.setCreationDate(new Date());

		for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
			throwIfAborted(signal);
			onProgress?.(pageNumber - 1, total, `Compressing page ${pageNumber}`);

			const page = await source.getPage(pageNumber);
			try {
				const viewport = page.getViewport({ scale });
				const canvas = createCanvas(viewport.width, viewport.height);
				const context = canvas.getContext('2d');
				if (!context) {
					throw new Error('Canvas 2D context is unavailable in this browser');
				}
				context.fillStyle = '#ffffff';
				context.fillRect(0, 0, canvas.width, canvas.height);
				await page.render({ canvasContext: context, canvas, viewport, background: '#ffffff' })
					.promise;

				const blob = await canvasToBlob(canvas, 'image/jpeg', options.quality);
				const bytes = new Uint8Array(await blob.arrayBuffer());
				const image = await out.embedJpg(bytes);

				// Keep the page's original physical size (its 72dpi viewport).
				const base = page.getViewport({ scale: 1 });
				const pdfPage = out.addPage([base.width, base.height]);
				pdfPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
			} finally {
				page.cleanup();
			}

			onProgress?.(pageNumber, total, `Compressing page ${pageNumber}`);
		}

		const outBytes = await out.save({ useObjectStreams: true });
		const blob = new Blob([outBytes as unknown as BlobPart], { type: 'application/pdf' });
		return {
			blob,
			fileName: compressedFileName(file.name),
			pageCount: total,
			byteLength: blob.size,
		};
	} finally {
		await closePdf(source);
	}
}
