import type { ImageItem } from './types';
import { canvasToBlob, closeDrawable, createCanvas, decodeToDrawable } from './images';
import { stripExtension } from './format';

/** How the target size is expressed. */
export type ResizeMode = 'percentage' | 'longestEdge';

/** Output encoding the user can pick. `keep` re-encodes to the source format. */
export type ResizeFormat = 'keep' | 'jpeg' | 'png' | 'webp';

/** Concrete image types the canvas encoder can emit. */
export type ResizeOutputType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface ResizeOptions {
	mode: ResizeMode;
	/** Scale as a percentage of the original, 1-100. Used in `percentage` mode. */
	percentage: number;
	/** Longest-edge cap in pixels. Used in `longestEdge` mode. */
	longestEdge: number;
	format: ResizeFormat;
	/** Encoder quality (0-1) for the lossy formats. Ignored by PNG. */
	quality: number;
	/** Solid colour painted behind transparent pixels when emitting JPEG. */
	backgroundColor: string;
}

export const DEFAULT_RESIZE_OPTIONS: ResizeOptions = {
	mode: 'percentage',
	percentage: 50,
	longestEdge: 1600,
	format: 'keep',
	quality: 0.8,
	backgroundColor: '#ffffff',
};

export const RESIZE_PERCENTAGE_PRESETS = [25, 50, 75] as const;

export const EXTENSION_BY_OUTPUT: Record<ResizeOutputType, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
};

/** Formats the resize tool can decode and shrink. */
export const RESIZE_ACCEPT_ATTRIBUTE = [
	'image/png',
	'image/jpeg',
	'image/webp',
	'.png',
	'.jpg',
	'.jpeg',
	'.webp',
].join(',');

function clamp(value: number, min: number, max: number): number {
	if (!Number.isFinite(value)) {
		return min;
	}
	return Math.min(max, Math.max(min, value));
}

/**
 * Scale factor to apply to the source, always in (0, 1]. The tool only ever
 * shrinks, so an oversized `longestEdge` (or a percentage above 100) is clamped
 * back to the original size rather than enlarging the image.
 */
export function computeResizeScale(width: number, height: number, options: ResizeOptions): number {
	if (options.mode === 'longestEdge') {
		const longest = Math.max(width, height);
		// A missing or corrupt persisted cap (NaN, Infinity, <= 0) must not
		// collapse the image to 1×1 — fall back to a no-op shrink instead.
		if (longest <= 0 || !Number.isFinite(options.longestEdge) || options.longestEdge <= 0) {
			return 1;
		}
		return clamp(options.longestEdge / longest, 0, 1);
	}
	return clamp(options.percentage, 1, 100) / 100;
}

/** Target pixel dimensions after scaling, never smaller than 1×1. */
export function computeResizedDimensions(
	width: number,
	height: number,
	options: ResizeOptions,
): { width: number; height: number } {
	const scale = computeResizeScale(width, height, options);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/** Resolve the concrete encoder type from the requested format and source. */
export function resolveOutputType(sourceType: string, format: ResizeFormat): ResizeOutputType {
	switch (format) {
		case 'jpeg':
			return 'image/jpeg';
		case 'png':
			return 'image/png';
		case 'webp':
			return 'image/webp';
		case 'keep':
		default:
			if (sourceType === 'image/jpeg') {
				return 'image/jpeg';
			}
			if (sourceType === 'image/webp') {
				return 'image/webp';
			}
			// PNG passthrough, and a safe lossless default for anything else.
			return 'image/png';
	}
}

/** PNG is lossless and ignores the quality argument; JPEG and WebP honour it. */
export function isLossyOutput(type: ResizeOutputType): boolean {
	return type === 'image/jpeg' || type === 'image/webp';
}

/** Rename a source file to carry the output format's extension. */
export function resizeFileName(originalName: string, type: ResizeOutputType): string {
	return `${stripExtension(originalName)}.${EXTENSION_BY_OUTPUT[type]}`;
}

/**
 * Fraction of bytes saved versus the original, in [-∞, 1]. Negative when the
 * re-encoded output is actually larger than the source.
 */
export function byteSavings(originalBytes: number, newBytes: number): number {
	if (originalBytes <= 0) {
		return 0;
	}
	return 1 - newBytes / originalBytes;
}

export interface ResizeResult {
	blob: Blob;
	width: number;
	height: number;
	type: ResizeOutputType;
	fileName: string;
}

/**
 * Decode an image, scale it on a canvas and re-encode it, returning the shrunk
 * blob together with its final dimensions and name. Uses canvas APIs, so it is
 * exercised in a real browser rather than jsdom.
 */
export async function resizeImageFile(item: ImageItem, options: ResizeOptions): Promise<ResizeResult> {
	const target = computeResizedDimensions(item.width, item.height, options);
	const outputType = resolveOutputType(item.type, options.format);
	const source = await decodeToDrawable(item.file);
	try {
		const canvas = createCanvas(target.width, target.height);
		const context = canvas.getContext('2d');
		if (!context) {
			throw new Error('Canvas 2D context is unavailable in this browser');
		}
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = 'high';
		if (outputType === 'image/jpeg') {
			// JPEG has no alpha channel, so flatten onto a solid background.
			context.fillStyle = options.backgroundColor || '#ffffff';
			context.fillRect(0, 0, target.width, target.height);
		}
		context.drawImage(source, 0, 0, target.width, target.height);
		const blob = await canvasToBlob(
			canvas,
			outputType,
			isLossyOutput(outputType) ? options.quality : undefined,
		);
		return {
			blob,
			width: target.width,
			height: target.height,
			type: outputType,
			fileName: resizeFileName(item.name, outputType),
		};
	} finally {
		closeDrawable(source);
	}
}
