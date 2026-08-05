import {
	GlobalWorkerOptions,
	getDocument,
	PasswordResponses,
	type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ImageFormat, RasterizeOptions, RenderedPage } from './types';
import { canvasToBlob, createCanvas, nextId } from './images';
import { expandFileNamePattern, stripExtension } from './format';
import { parsePageRange } from './pageRange';
import { POINTS_PER_INCH } from './pageSizes';

GlobalWorkerOptions.workerSrc = workerUrl;

export const DEFAULT_RASTERIZE_OPTIONS: RasterizeOptions = {
	format: 'png',
	quality: 0.92,
	dpi: 150,
	pageRange: '',
	transparent: false,
	fileNamePattern: '{name}-{page}',
};

export const DPI_PRESETS = [72, 96, 150, 200, 300, 400, 600] as const;

/** Thrown when a document needs a password we do not have. */
export class PdfPasswordRequiredError extends Error {
	readonly wrongPassword: boolean;

	constructor(wrongPassword: boolean) {
		super(wrongPassword ? 'Incorrect password' : 'This PDF is password protected');
		this.name = 'PdfPasswordRequiredError';
		this.wrongPassword = wrongPassword;
	}
}

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
	png: 'image/png',
	jpeg: 'image/jpeg',
	webp: 'image/webp',
};

export const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
	png: 'png',
	jpeg: 'jpg',
	webp: 'webp',
};

/** Open a PDF, surfacing password prompts as a typed error. */
export async function openPdf(data: ArrayBuffer, password?: string): Promise<PDFDocumentProxy> {
	const task = getDocument({
		// pdf.js transfers ownership of the buffer, so hand it a private copy.
		data: new Uint8Array(data.slice(0)),
		password,
		useSystemFonts: true,
	});

	task.onPassword = (_updatePassword: (value: string) => void, reason: number) => {
		task.destroy();
		throw new PdfPasswordRequiredError(reason === PasswordResponses.INCORRECT_PASSWORD);
	};

	try {
		return await task.promise;
	} catch (error) {
		if (error instanceof PdfPasswordRequiredError) {
			throw error;
		}
		if (isPasswordException(error)) {
			throw new PdfPasswordRequiredError(
				(error as { code?: number }).code === PasswordResponses.INCORRECT_PASSWORD,
			);
		}
		throw error;
	}
}

function isPasswordException(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'name' in error &&
		(error as { name?: string }).name === 'PasswordException'
	);
}

/** Release a document and its worker. */
export async function closePdf(pdf: PDFDocumentProxy): Promise<void> {
	await pdf.loadingTask.destroy();
}

export async function readPdfPageCount(file: File, password?: string): Promise<number> {
	const buffer = await file.arrayBuffer();
	const pdf = await openPdf(buffer, password);
	const pageCount = pdf.numPages;
	await closePdf(pdf);
	return pageCount;
}

export interface RasterizeProgress {
	(completed: number, total: number, label: string): void;
}

export interface RasterizeRequest {
	file: File;
	sourceId: string;
	password?: string;
}

/** Render selected pages of one or more PDFs into image blobs. */
export async function rasterizePdfs(
	requests: readonly RasterizeRequest[],
	options: RasterizeOptions,
	onProgress?: RasterizeProgress,
	signal?: AbortSignal,
): Promise<{ pages: RenderedPage[]; errors: string[] }> {
	const pages: RenderedPage[] = [];
	const errors: string[] = [];

	// Resolve the work list first so the progress bar has an accurate total.
	const plans: Array<{ request: RasterizeRequest; pdf: PDFDocumentProxy; pageNumbers: number[] }> = [];
	for (const request of requests) {
		try {
			const buffer = await request.file.arrayBuffer();
			const pdf = await openPdf(buffer, request.password);
			const { pages: pageNumbers, errors: rangeErrors } = parsePageRange(
				options.pageRange,
				pdf.numPages,
			);
			for (const message of rangeErrors) {
				errors.push(`${request.file.name}: ${message}`);
			}
			if (pageNumbers.length === 0) {
				errors.push(`${request.file.name}: no pages matched the selected range`);
				await closePdf(pdf);
				continue;
			}
			plans.push({ request, pdf, pageNumbers });
		} catch (error) {
			errors.push(`${request.file.name}: ${describeError(error)}`);
		}
	}

	const total = plans.reduce((sum, plan) => sum + plan.pageNumbers.length, 0);
	let completed = 0;
	const scale = options.dpi / POINTS_PER_INCH;
	const mimeType = MIME_BY_FORMAT[options.format];
	const extension = EXTENSION_BY_FORMAT[options.format];

	try {
		for (const plan of plans) {
			const baseName = stripExtension(plan.request.file.name);
			for (const pageNumber of plan.pageNumbers) {
				if (signal?.aborted) {
					throw new DOMException('Conversion cancelled', 'AbortError');
				}
				onProgress?.(completed, total, `${plan.request.file.name} · page ${pageNumber}`);

				try {
					const page = await plan.pdf.getPage(pageNumber);
					const viewport = page.getViewport({ scale });
					const canvas = createCanvas(viewport.width, viewport.height);
					const context = canvas.getContext('2d', {
						willReadFrequently: false,
					}) as CanvasRenderingContext2D | null;
					if (!context) {
						throw new Error('Canvas 2D context is unavailable in this browser');
					}

					const opaque = options.format !== 'png' || !options.transparent;
					if (opaque) {
						context.fillStyle = '#ffffff';
						context.fillRect(0, 0, canvas.width, canvas.height);
					}

					await page.render({
						canvasContext: context,
						canvas,
						viewport,
						background: opaque ? '#ffffff' : 'rgba(0,0,0,0)',
					}).promise;

					const blob = await canvasToBlob(
						canvas,
						mimeType,
						options.format === 'png' ? undefined : options.quality,
					);
					page.cleanup();

					const fileName = `${expandFileNamePattern(options.fileNamePattern, {
						name: baseName,
						page: pageNumber,
						pageCount: plan.pdf.numPages,
						index: completed + 1,
						total,
					})}.${extension}`;

					pages.push({
						id: nextId('page'),
						pageNumber,
						sourceName: plan.request.file.name,
						sourceId: plan.request.sourceId,
						blob,
						url: URL.createObjectURL(blob),
						width: canvas.width,
						height: canvas.height,
						fileName,
						selected: true,
					});
				} catch (error) {
					if (error instanceof DOMException && error.name === 'AbortError') {
						throw error;
					}
					errors.push(`${plan.request.file.name} page ${pageNumber}: ${describeError(error)}`);
				}

				completed += 1;
				onProgress?.(completed, total, `${plan.request.file.name} · page ${pageNumber}`);
			}
		}
	} catch (error) {
		// Nothing downstream will ever see these pages, so release the blobs
		// they pin rather than stranding them for the life of the document.
		for (const page of pages) {
			URL.revokeObjectURL(page.url);
		}
		pages.length = 0;
		throw error;
	} finally {
		await Promise.all(plans.map((plan) => closePdf(plan.pdf).catch(() => undefined)));
	}

	return { pages, errors };
}

/** Render one page of an already-open document into a small preview blob. */
async function renderThumbnailFromPage(
	pdf: PDFDocumentProxy,
	pageNumber: number,
	maxEdge: number,
): Promise<{ url: string; width: number; height: number }> {
	const page = await pdf.getPage(pageNumber);
	try {
		const base = page.getViewport({ scale: 1 });
		const scale = Math.min(2, maxEdge / Math.max(base.width, base.height));
		const viewport = page.getViewport({ scale });
		const canvas = createCanvas(viewport.width, viewport.height);
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Canvas 2D context is unavailable in this browser');
		}
		context.fillStyle = '#ffffff';
		context.fillRect(0, 0, canvas.width, canvas.height);
		await page.render({ canvasContext: context, canvas, viewport }).promise;
		const blob = await canvasToBlob(canvas, 'image/jpeg', 0.8);
		return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height };
	} finally {
		page.cleanup();
	}
}

/** Render a single small preview of a PDF page, used for one-off thumbnails. */
export async function renderPdfThumbnail(
	file: File,
	pageNumber: number,
	maxEdge: number,
	password?: string,
): Promise<{ url: string; width: number; height: number }> {
	const buffer = await file.arrayBuffer();
	const pdf = await openPdf(buffer, password);
	try {
		return await renderThumbnailFromPage(pdf, pageNumber, maxEdge);
	} finally {
		await closePdf(pdf);
	}
}

/**
 * Render previews for many pages of one document. The file is parsed once and
 * a single worker is reused, which matters a great deal for large PDFs. Each
 * thumbnail is handed to `onThumbnail` as soon as it is ready so the UI can
 * fill in progressively; URLs produced after an abort are revoked immediately
 * rather than leaked.
 */
export async function renderPdfThumbnails(
	file: File,
	maxEdge: number,
	onThumbnail: (pageNumber: number, url: string) => void,
	signal?: AbortSignal,
	password?: string,
): Promise<void> {
	const buffer = await file.arrayBuffer();
	if (signal?.aborted) {
		return;
	}

	const pdf = await openPdf(buffer, password);
	try {
		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
			if (signal?.aborted) {
				return;
			}
			try {
				const { url } = await renderThumbnailFromPage(pdf, pageNumber, maxEdge);
				if (signal?.aborted) {
					URL.revokeObjectURL(url);
					return;
				}
				onThumbnail(pageNumber, url);
			} catch {
				// A missing thumbnail is not fatal; the tile keeps its placeholder.
			}
		}
	} finally {
		await closePdf(pdf);
	}
}

export function describeError(error: unknown): string {
	if (error instanceof PdfPasswordRequiredError) {
		return error.message;
	}
	if (error instanceof Error) {
		return error.message;
	}
	return String(error);
}
