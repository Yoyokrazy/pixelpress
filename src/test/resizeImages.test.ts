import { describe, expect, it } from 'vitest';
import {
	byteSavings,
	computeResizeScale,
	computeResizedDimensions,
	DEFAULT_RESIZE_OPTIONS,
	isLossyOutput,
	RESIZE_ACCEPT_ATTRIBUTE,
	resizeFileName,
	resolveOutputType,
	type ResizeOptions,
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
