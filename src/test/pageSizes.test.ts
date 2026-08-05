import { describe, expect, it } from 'vitest';
import {
	applyOrientation,
	AUTO_PAGE_SIZE,
	CUSTOM_PAGE_SIZE,
	getPageSizePreset,
	mmToPoints,
	PAGE_SIZES,
	pointsToMm,
	resolvePageSize,
} from '../lib/pageSizes';

describe('unit conversion', () => {
	it('converts millimetres to points and back', () => {
		expect(mmToPoints(25.4)).toBeCloseTo(72, 6);
		expect(pointsToMm(72)).toBeCloseTo(25.4, 6);
		expect(pointsToMm(mmToPoints(210))).toBeCloseTo(210, 6);
	});

	it('sizes A4 correctly', () => {
		const a4 = getPageSizePreset('a4');
		expect(a4?.width).toBeCloseTo(595.28, 1);
		expect(a4?.height).toBeCloseTo(841.89, 1);
	});
});

describe('PAGE_SIZES', () => {
	it('exposes unique ids', () => {
		const ids = PAGE_SIZES.map((preset) => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('stores presets in portrait form', () => {
		for (const preset of PAGE_SIZES) {
			if (preset.width !== null && preset.height !== null && preset.id !== 'square') {
				expect(preset.width).toBeLessThanOrEqual(preset.height);
			}
		}
	});
});

describe('applyOrientation', () => {
	it('forces portrait and landscape', () => {
		expect(applyOrientation(100, 200, 'portrait')).toEqual({ width: 100, height: 200 });
		expect(applyOrientation(200, 100, 'portrait')).toEqual({ width: 100, height: 200 });
		expect(applyOrientation(100, 200, 'landscape')).toEqual({ width: 200, height: 100 });
	});

	it('follows the image aspect ratio in auto mode', () => {
		expect(applyOrientation(100, 200, 'auto', 2)).toEqual({ width: 200, height: 100 });
		expect(applyOrientation(200, 100, 'auto', 0.5)).toEqual({ width: 100, height: 200 });
	});

	it('leaves dimensions alone when the aspect ratio is unknown', () => {
		expect(applyOrientation(100, 200, 'auto')).toEqual({ width: 100, height: 200 });
		expect(applyOrientation(100, 200, 'auto', Number.NaN)).toEqual({ width: 100, height: 200 });
	});
});

describe('resolvePageSize', () => {
	it('returns null for the fit-to-image preset', () => {
		expect(resolvePageSize(AUTO_PAGE_SIZE, 'auto', 210, 297)).toBeNull();
	});

	it('returns null for an unknown preset', () => {
		expect(resolvePageSize('does-not-exist', 'auto', 210, 297)).toBeNull();
	});

	it('resolves a preset with orientation applied', () => {
		const landscape = resolvePageSize('a4', 'landscape', 210, 297);
		expect(landscape?.width).toBeCloseTo(841.89, 1);
		expect(landscape?.height).toBeCloseTo(595.28, 1);
	});

	it('resolves custom dimensions', () => {
		const custom = resolvePageSize(CUSTOM_PAGE_SIZE, 'portrait', 100, 150);
		expect(custom?.width).toBeCloseTo(mmToPoints(100), 6);
		expect(custom?.height).toBeCloseTo(mmToPoints(150), 6);
	});

	it('clamps non-positive custom dimensions', () => {
		const custom = resolvePageSize(CUSTOM_PAGE_SIZE, 'portrait', 0, -20);
		expect(custom?.width).toBeGreaterThan(0);
		expect(custom?.height).toBeGreaterThan(0);
	});
});
