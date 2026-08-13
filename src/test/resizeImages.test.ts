import { describe, expect, it } from 'vitest';
import {
	byteSavings,
	computeResizeScale,
	computeResizedDimensions,
	DEFAULT_RESIZE_OPTIONS,
	DEFAULT_TARGET_SEARCH,
	isLossyOutput,
	RESIZE_ACCEPT_ATTRIBUTE,
	resizeFileName,
	resolveOutputType,
	resolveTargetOutputType,
	searchEncodeToTarget,
	type ResizeOptions,
	type TargetSearchConfig,
} from '../lib/resizeImages';

function options(overrides: Partial<ResizeOptions> = {}): ResizeOptions {
	return { ...DEFAULT_RESIZE_OPTIONS, ...overrides };
}

describe('computeResizeScale', () => {
	it('reads the percentage in percentage mode', () => {
		expect(computeResizeScale(1000, 800, options({ mode: 'percentage', percentage: 50 }))).toBe(0.5);
		expect(computeResizeScale(1000, 800, options({ mode: 'percentage', percentage: 25 }))).toBe(0.25);
	});

	it('clamps the percentage into 1-100', () => {
		expect(computeResizeScale(1000, 800, options({ mode: 'percentage', percentage: 300 }))).toBe(1);
		expect(computeResizeScale(1000, 800, options({ mode: 'percentage', percentage: 0 }))).toBe(0.01);
		expect(computeResizeScale(1000, 800, options({ mode: 'percentage', percentage: NaN }))).toBe(0.01);
	});

	it('scales the longest edge down to the cap', () => {
		expect(computeResizeScale(2000, 1000, options({ mode: 'longestEdge', longestEdge: 1000 }))).toBe(0.5);
		expect(computeResizeScale(1000, 2000, options({ mode: 'longestEdge', longestEdge: 500 }))).toBe(0.25);
	});

	it('never enlarges when the cap exceeds the source', () => {
		expect(computeResizeScale(800, 600, options({ mode: 'longestEdge', longestEdge: 4000 }))).toBe(1);
	});

	it('is a safe no-op when a persisted cap is missing or corrupt', () => {
		expect(computeResizeScale(800, 600, options({ mode: 'longestEdge', longestEdge: 0 }))).toBe(1);
		expect(computeResizeScale(800, 600, options({ mode: 'longestEdge', longestEdge: -100 }))).toBe(1);
		expect(computeResizeScale(800, 600, options({ mode: 'longestEdge', longestEdge: NaN }))).toBe(1);
		expect(
			computeResizeScale(800, 600, options({ mode: 'longestEdge', longestEdge: Infinity })),
		).toBe(1);
	});

	it('is safe for a degenerate zero-size source', () => {
		expect(computeResizeScale(0, 0, options({ mode: 'longestEdge', longestEdge: 500 }))).toBe(1);
	});

	it('predicts the original size in target-size mode (scale chosen later)', () => {
		expect(computeResizeScale(1000, 800, options({ mode: 'targetSize', targetSizeKb: 100 }))).toBe(1);
	});
});

describe('resolveTargetOutputType', () => {
	it('honours an explicit lossy format', () => {
		expect(resolveTargetOutputType('image/png', 'jpeg')).toBe('image/jpeg');
		expect(resolveTargetOutputType('image/jpeg', 'webp')).toBe('image/webp');
	});

	it('never targets PNG — an explicit PNG request falls back to WebP', () => {
		expect(resolveTargetOutputType('image/png', 'png')).toBe('image/webp');
	});

	it('keeps a JPEG source as JPEG and uses WebP otherwise under keep', () => {
		expect(resolveTargetOutputType('image/jpeg', 'keep')).toBe('image/jpeg');
		expect(resolveTargetOutputType('image/png', 'keep')).toBe('image/webp');
		expect(resolveTargetOutputType('image/webp', 'keep')).toBe('image/webp');
	});
});

describe('searchEncodeToTarget', () => {
	function config(overrides: Partial<TargetSearchConfig> = {}): TargetSearchConfig {
		return { ...DEFAULT_TARGET_SEARCH, targetBytes: 100_000, ...overrides };
	}

	// Model encoder: size grows with quality and with scale² (like real pixels).
	function modelEncoder(baseBytes: number) {
		const calls: Array<{ quality: number; scale: number }> = [];
		const encode = async (quality: number, scale: number): Promise<number> => {
			calls.push({ quality, scale });
			return baseBytes * scale * scale * quality;
		};
		return { encode, calls };
	}

	it('stays at full scale and tunes quality when the budget allows', async () => {
		const { encode } = modelEncoder(200_000);
		const result = await searchEncodeToTarget(encode, config({ targetBytes: 120_000 }));
		expect(result.scale).toBe(1);
		expect(result.underTarget).toBe(true);
		expect(result.bytes).toBeLessThanOrEqual(120_000);
		// Highest quality that fits: 120000/200000 = 0.6, so best ≤ 0.6.
		expect(result.quality).toBeLessThanOrEqual(0.6 + 1e-9);
		expect(result.quality).toBeGreaterThan(0.3);
	});

	it('downscales when even the lowest quality at full scale is too big', async () => {
		// At scale 1, min quality (0.3) → 300000 > target; must shrink.
		const { encode } = modelEncoder(1_000_000);
		const result = await searchEncodeToTarget(encode, config({ targetBytes: 100_000 }));
		expect(result.scale).toBeLessThan(1);
		expect(result.underTarget).toBe(true);
		expect(result.bytes).toBeLessThanOrEqual(100_000);
	});

	it('reports best effort when nothing fits the budget', async () => {
		const { encode } = modelEncoder(100_000_000);
		const result = await searchEncodeToTarget(encode, config({ targetBytes: 1000 }));
		expect(result.underTarget).toBe(false);
		expect(result.scale).toBe(DEFAULT_TARGET_SEARCH.scales.at(-1));
		expect(result.quality).toBe(DEFAULT_TARGET_SEARCH.minQuality);
	});

	it('picks the largest scale that can satisfy the budget', async () => {
		// base 260000: scale 1 min = 78000 ≤ 100000, so scale 1 already works.
		const { encode, calls } = modelEncoder(260_000);
		const result = await searchEncodeToTarget(encode, config({ targetBytes: 100_000 }));
		expect(result.scale).toBe(1);
		// Only the winning scale is probed (no wasted downscale attempts).
		expect(calls.every((c) => c.scale === 1)).toBe(true);
	});

	it('falls back to a single scale when the list is empty', async () => {
		const { encode } = modelEncoder(50_000);
		const result = await searchEncodeToTarget(encode, config({ scales: [], targetBytes: 100_000 }));
		expect(result.scale).toBe(1);
		expect(result.underTarget).toBe(true);
	});
});

describe('computeResizedDimensions', () => {
	it('rounds to whole pixels', () => {
		expect(computeResizedDimensions(1000, 667, options({ percentage: 50 }))).toEqual({
			width: 500,
			height: 334,
		});
	});

	it('never returns less than one pixel per side', () => {
		expect(computeResizedDimensions(3, 3, options({ percentage: 1 }))).toEqual({ width: 1, height: 1 });
	});

	it('keeps the original size at 100%', () => {
		expect(computeResizedDimensions(1280, 720, options({ percentage: 100 }))).toEqual({
			width: 1280,
			height: 720,
		});
	});
});

describe('resolveOutputType', () => {
	it('keeps the source format in keep mode', () => {
		expect(resolveOutputType('image/jpeg', 'keep')).toBe('image/jpeg');
		expect(resolveOutputType('image/webp', 'keep')).toBe('image/webp');
		expect(resolveOutputType('image/png', 'keep')).toBe('image/png');
	});

	it('falls back to PNG for formats it cannot re-emit as-is', () => {
		expect(resolveOutputType('image/gif', 'keep')).toBe('image/png');
		expect(resolveOutputType('', 'keep')).toBe('image/png');
	});

	it('honours an explicit format', () => {
		expect(resolveOutputType('image/png', 'jpeg')).toBe('image/jpeg');
		expect(resolveOutputType('image/jpeg', 'png')).toBe('image/png');
		expect(resolveOutputType('image/png', 'webp')).toBe('image/webp');
	});
});

describe('isLossyOutput', () => {
	it('marks JPEG and WebP lossy but not PNG', () => {
		expect(isLossyOutput('image/jpeg')).toBe(true);
		expect(isLossyOutput('image/webp')).toBe(true);
		expect(isLossyOutput('image/png')).toBe(false);
	});
});

describe('resizeFileName', () => {
	it('swaps the extension for the output format', () => {
		expect(resizeFileName('holiday.png', 'image/jpeg')).toBe('holiday.jpg');
		expect(resizeFileName('scan.jpeg', 'image/webp')).toBe('scan.webp');
		expect(resizeFileName('logo.webp', 'image/png')).toBe('logo.png');
	});

	it('handles names without an extension', () => {
		expect(resizeFileName('photo', 'image/png')).toBe('photo.png');
	});
});

describe('byteSavings', () => {
	it('reports the fraction of bytes saved', () => {
		expect(byteSavings(1000, 250)).toBeCloseTo(0.75);
		expect(byteSavings(1000, 1000)).toBe(0);
	});

	it('goes negative when the output grew', () => {
		expect(byteSavings(1000, 1500)).toBeCloseTo(-0.5);
	});

	it('returns zero for a missing original size', () => {
		expect(byteSavings(0, 500)).toBe(0);
	});
});

describe('RESIZE_ACCEPT_ATTRIBUTE', () => {
	it('lists the raster formats the tool can shrink', () => {
		expect(RESIZE_ACCEPT_ATTRIBUTE).toContain('image/png');
		expect(RESIZE_ACCEPT_ATTRIBUTE).toContain('.webp');
		expect(RESIZE_ACCEPT_ATTRIBUTE).not.toContain('application/pdf');
	});
});
