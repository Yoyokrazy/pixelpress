import type { ImageItem } from './types';
import { rotatedSize } from './layout';

/** Formats the app accepts as conversion input. */
export const ACCEPTED_IMAGE_TYPES = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'image/gif',
	'image/bmp',
	'image/avif',
	'image/tiff',
	'image/svg+xml',
] as const;

export const IMAGE_ACCEPT_ATTRIBUTE = [...ACCEPTED_IMAGE_TYPES, '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.tif', '.tiff', '.svg'].join(',');

const EXTENSION_TYPES: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	jpe: 'image/jpeg',
	webp: 'image/webp',
	gif: 'image/gif',
	bmp: 'image/bmp',
	avif: 'image/avif',
	tif: 'image/tiff',
	tiff: 'image/tiff',
	svg: 'image/svg+xml',
};

export function isImageFile(file: File): boolean {
	return normaliseImageType(file).startsWith('image/');
}

export function isPdfFile(file: File): boolean {
	return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** Browsers sometimes report an empty type; fall back to the extension. */
export function normaliseImageType(file: File): string {
	if (file.type && file.type !== 'application/octet-stream') {
		return file.type;
	}
	const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
	return EXTENSION_TYPES[extension] ?? file.type ?? '';
}

let idCounter = 0;

export function nextId(prefix: string): string {
	idCounter += 1;
	const random =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID().slice(0, 8)
			: Math.random().toString(36).slice(2, 10);
	return `${prefix}-${idCounter}-${random}`;
}

/** Read the intrinsic size of an image file without keeping the bitmap around. */
export async function readImageSize(
	file: File,
	objectUrl: string,
): Promise<{ width: number; height: number }> {
	if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
		try {
			const bitmap = await createImageBitmap(file);
			const size = { width: bitmap.width, height: bitmap.height };
			bitmap.close();
			return size;
		} catch {
			// Fall through to the HTMLImageElement path below.
		}
	}

	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => {
			resolve({
				width: image.naturalWidth || image.width || 1,
				height: image.naturalHeight || image.height || 1,
			});
		};
		image.onerror = () => reject(new Error(`Could not decode "${file.name}"`));
		image.src = objectUrl;
	});
}

export interface LoadImagesResult {
	items: ImageItem[];
	errors: string[];
}

/** Turn raw File objects into decoded, previewable image items. */
export async function loadImageItems(
	files: readonly File[],
	onProgress?: (loaded: number, total: number) => void,
): Promise<LoadImagesResult> {
	const items: ImageItem[] = [];
	const errors: string[] = [];
	let loaded = 0;

	for (const file of files) {
		if (!isImageFile(file)) {
			errors.push(`${file.name} is not a supported image`);
			loaded += 1;
			onProgress?.(loaded, files.length);
			continue;
		}

		const previewUrl = URL.createObjectURL(file);
		try {
			const { width, height } = await readImageSize(file, previewUrl);
			items.push({
				id: nextId('img'),
				file,
				name: file.name,
				size: file.size,
				lastModified: file.lastModified,
				previewUrl,
				width,
				height,
				rotation: 0,
				type: normaliseImageType(file),
			});
		} catch (error) {
			URL.revokeObjectURL(previewUrl);
			errors.push(error instanceof Error ? error.message : `Could not read ${file.name}`);
		}
		loaded += 1;
		onProgress?.(loaded, files.length);
	}

	return { items, errors };
}

/** Effective on-page dimensions once the user's rotation is applied. */
export function effectiveSize(item: ImageItem): { width: number; height: number } {
	return rotatedSize(item.width, item.height, item.rotation);
}

export interface RasterResult {
	bytes: Uint8Array;
	type: 'image/png' | 'image/jpeg';
	width: number;
	height: number;
}

/**
 * Decode an image and re-encode it into a format pdf-lib can embed
 * (PNG or JPEG), applying rotation, downscaling and optional JPEG
 * compression along the way. PNG/JPEG inputs that need no processing are
 * passed through untouched so no quality is lost.
 */
export async function prepareImageForPdf(
	item: ImageItem,
	options: {
		compress: boolean;
		jpegQuality: number;
		maxDimension: number;
		backgroundColor: string;
	},
): Promise<RasterResult> {
	const passthroughType =
		item.type === 'image/png' ? 'image/png' : item.type === 'image/jpeg' ? 'image/jpeg' : null;
	const needsDownscale =
		options.maxDimension > 0 && Math.max(item.width, item.height) > options.maxDimension;
	const needsRotation = item.rotation !== 0;

	if (passthroughType && !options.compress && !needsDownscale && !needsRotation) {
		const buffer = await item.file.arrayBuffer();
		return {
			bytes: new Uint8Array(buffer),
			type: passthroughType,
			width: item.width,
			height: item.height,
		};
	}

	const source = await decodeToDrawable(item.file);
	const scale = needsDownscale
		? options.maxDimension / Math.max(item.width, item.height)
		: 1;
	const scaledWidth = Math.max(1, Math.round(item.width * scale));
	const scaledHeight = Math.max(1, Math.round(item.height * scale));
	const target = rotatedSize(scaledWidth, scaledHeight, item.rotation);

	const canvas = createCanvas(target.width, target.height);
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('Canvas 2D context is unavailable in this browser');
	}
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';

	const outputType: 'image/png' | 'image/jpeg' = options.compress ? 'image/jpeg' : 'image/png';
	if (outputType === 'image/jpeg') {
		// JPEG has no alpha channel, so flatten onto the page background first.
		context.fillStyle = options.backgroundColor || '#ffffff';
		context.fillRect(0, 0, target.width, target.height);
	}

	context.save();
	context.translate(target.width / 2, target.height / 2);
	context.rotate((item.rotation * Math.PI) / 180);
	context.drawImage(
		source,
		-scaledWidth / 2,
		-scaledHeight / 2,
		scaledWidth,
		scaledHeight,
	);
	context.restore();
	closeDrawable(source);

	const blob = await canvasToBlob(canvas, outputType, options.jpegQuality);
	const bytes = new Uint8Array(await blob.arrayBuffer());
	return { bytes, type: outputType, width: target.width, height: target.height };
}

type Drawable = ImageBitmap | HTMLImageElement;

async function decodeToDrawable(file: File): Promise<Drawable> {
	if (typeof createImageBitmap === 'function' && file.type !== 'image/svg+xml') {
		try {
			return await createImageBitmap(file);
		} catch {
			// Fall through to the <img> decoder.
		}
	}

	const url = URL.createObjectURL(file);
	try {
		return await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error(`Could not decode "${file.name}"`));
			image.src = url;
		});
	} finally {
		// The bitmap is fully decoded by the time the promise settles.
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}
}

function closeDrawable(drawable: Drawable): void {
	if ('close' in drawable && typeof drawable.close === 'function') {
		drawable.close();
	}
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(width));
	canvas.height = Math.max(1, Math.round(height));
	return canvas;
}

export function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality?: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (blob) {
					resolve(blob);
				} else {
					reject(new Error(`Could not encode image as ${type}`));
				}
			},
			type,
			quality,
		);
	});
}

/** Build a small preview data URL, used for PDF page thumbnails in lists. */
export async function shrinkToThumbnail(
	blob: Blob,
	maxEdge: number,
): Promise<{ url: string; width: number; height: number }> {
	const bitmap = await createImageBitmap(blob);
	const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = createCanvas(width, height);
	const context = canvas.getContext('2d');
	if (!context) {
		bitmap.close();
		throw new Error('Canvas 2D context is unavailable in this browser');
	}
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	const thumbnail = await canvasToBlob(canvas, 'image/jpeg', 0.75);
	return { url: URL.createObjectURL(thumbnail), width, height };
}
