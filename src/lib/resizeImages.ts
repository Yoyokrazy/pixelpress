import type { ImageItem } from './types';
import { canvasToBlob, closeDrawable, createCanvas, decodeToDrawable } from './images';
import { stripExtension } from './format';

/** How the target size is expressed. */
export type ResizeMode = 'percentage' | 'longestEdge' | 'targetSize';

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
	/** Desired maximum output size in kilobytes. Used in `targetSize` mode. */
	targetSizeKb: number;
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
	targetSizeKb: 500,
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
	if (options.mode === 'targetSize') {
		// The final scale is chosen by the encoder search; the synchronous
		// prediction just shows the original size until a preview resolves.
		return 1;
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

/**
 * Output type for target-size mode. Hitting an arbitrary byte budget needs a
 * quality knob, so PNG is never used: an explicit PNG request (or a PNG/other
 * source under `keep`) falls back to WebP, which compresses best.
 */
export function resolveTargetOutputType(sourceType: string, format: ResizeFormat): ResizeOutputType {
	if (format === 'jpeg') {
		return 'image/jpeg';
	}
	if (format === 'webp') {
		return 'image/webp';
	}
	// `keep` with a JPEG source stays JPEG; everything else uses WebP.
	return sourceType === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
}

export interface TargetSearchConfig {
	/** Desired maximum output size in bytes. */
	targetBytes: number;
	minQuality: number;
	maxQuality: number;
	/** Binary-search iterations spent refining quality at a viable scale. */
	qualitySteps: number;
	/** Scale factors to try, largest first, so resolution is preserved when it can be. */
	scales: number[];
}

export const DEFAULT_TARGET_SEARCH: Omit<TargetSearchConfig, 'targetBytes'> = {
	minQuality: 0.3,
	maxQuality: 0.95,
	qualitySteps: 5,
	scales: [1, 0.8, 0.65, 0.5, 0.4, 0.3],
};

export interface TargetSearchResult {
	quality: number;
	scale: number;
	bytes: number;
	/** False when even the smallest scale at the lowest quality exceeds the budget. */
	underTarget: boolean;
}

/**
 * Find the highest-quality, largest-scale encoding that fits within a byte
 * budget. `encode(quality, scale)` reports the resulting size; the algorithm is
 * pure with respect to that callback, so it is unit tested with a model encoder
 * while production passes a real canvas encoder. Output size is assumed
 * monotonic in both quality and scale.
 */
export async function searchEncodeToTarget(
	encode: (quality: number, scale: number) => Promise<number>,
	config: TargetSearchConfig,
): Promise<TargetSearchResult> {
	const { targetBytes, minQuality, maxQuality, qualitySteps, scales } = config;
	const scaleList = scales.length > 0 ? scales : [1];

	for (const scale of scaleList) {
		const minBytes = await encode(minQuality, scale);
		if (minBytes > targetBytes) {
			// Even the worst quality at this scale is too large; downscale further.
			continue;
		}
		let lo = minQuality;
		let hi = maxQuality;
		let best = minQuality;
		let bestBytes = minBytes;
		for (let step = 0; step < qualitySteps; step += 1) {
			const mid = (lo + hi) / 2;
			const bytes = await encode(mid, scale);
			if (bytes <= targetBytes) {
				best = mid;
				bestBytes = bytes;
				lo = mid;
			} else {
				hi = mid;
			}
		}
		return { quality: best, scale, bytes: bestBytes, underTarget: true };
	}

	// Nothing fit: fall back to the smallest scale at the lowest quality.
	const smallest = scaleList[scaleList.length - 1] ?? 1;
	const bytes = await encode(minQuality, smallest);
	return { quality: minQuality, scale: smallest, bytes, underTarget: false };
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
 * Draw the decoded source into a scaled canvas and encode it. Shared by the
 * fixed-scale path and the target-size search.
 */
async function drawAndEncode(
	source: Awaited<ReturnType<typeof decodeToDrawable>>,
	baseWidth: number,
	baseHeight: number,
	scale: number,
	type: ResizeOutputType,
	quality: number,
	backgroundColor: string,
): Promise<Blob> {
	const width = Math.max(1, Math.round(baseWidth * scale));
	const height = Math.max(1, Math.round(baseHeight * scale));
	const canvas = createCanvas(width, height);
	const context = canvas.getContext('2d');
	if (!context) {
		throw new Error('Canvas 2D context is unavailable in this browser');
	}
	context.imageSmoothingEnabled = true;
	context.imageSmoothingQuality = 'high';
	if (type === 'image/jpeg') {
		// JPEG has no alpha channel, so flatten onto a solid background.
		context.fillStyle = backgroundColor || '#ffffff';
		context.fillRect(0, 0, width, height);
	}
	context.drawImage(source, 0, 0, width, height);
	return canvasToBlob(canvas, type, isLossyOutput(type) ? quality : undefined);
}

/**
 * Decode an image, scale it on a canvas and re-encode it, returning the shrunk
 * blob together with its final dimensions and name. In `targetSize` mode the
 * quality and scale are chosen to fit the requested byte budget. Uses canvas
 * APIs, so it is exercised in a real browser rather than jsdom.
 */
export async function resizeImageFile(item: ImageItem, options: ResizeOptions): Promise<ResizeResult> {
	const background = options.backgroundColor;
	const source = await decodeToDrawable(item.file);
	try {
		if (options.mode === 'targetSize') {
			const outputType = resolveTargetOutputType(item.type, options.format);
			const targetBytes = Math.max(1, Math.round(options.targetSizeKb * 1024));
			const search = await searchEncodeToTarget(
				async (quality, scale) =>
					(await drawAndEncode(source, item.width, item.height, scale, outputType, quality, background)).size,
				{ ...DEFAULT_TARGET_SEARCH, targetBytes },
			);
			const blob = await drawAndEncode(
				source,
				item.width,
				item.height,
				search.scale,
				outputType,
				search.quality,
				background,
			);
			return {
				blob,
				width: Math.max(1, Math.round(item.width * search.scale)),
				height: Math.max(1, Math.round(item.height * search.scale)),
				type: outputType,
				fileName: resizeFileName(item.name, outputType),
			};
		}

		const outputType = resolveOutputType(item.type, options.format);
		const scale = computeResizeScale(item.width, item.height, options);
		const blob = await drawAndEncode(
			source,
			item.width,
			item.height,
			scale,
			outputType,
			options.quality,
			background,
		);
		return {
			blob,
			width: Math.max(1, Math.round(item.width * scale)),
			height: Math.max(1, Math.round(item.height * scale)),
			type: outputType,
			fileName: resizeFileName(item.name, outputType),
		};
	} finally {
		closeDrawable(source);
	}
}
