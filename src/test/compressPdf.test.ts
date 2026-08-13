import { describe, expect, it } from 'vitest';
import {
	compressedFileName,
	compressionSavings,
	COMPRESS_DPI_PRESETS,
	DEFAULT_COMPRESS_OPTIONS,
	dpiToScale,
} from '../lib/compressPdf';

describe('dpiToScale', () => {
	it('scales relative to 72dpi user space', () => {
		expect(dpiToScale(72)).toBe(1);
		expect(dpiToScale(144)).toBe(2);
		expect(dpiToScale(150)).toBeCloseTo(150 / 72, 6);
	});

	it('falls back to 1 for invalid input', () => {
		expect(dpiToScale(0)).toBe(1);
		expect(dpiToScale(-100)).toBe(1);
		expect(dpiToScale(NaN)).toBe(1);
		expect(dpiToScale(Infinity)).toBe(1);
	});
});

describe('compressedFileName', () => {
	it('appends -compressed and keeps the .pdf extension', () => {
		expect(compressedFileName('report.pdf')).toBe('report-compressed.pdf');
		expect(compressedFileName('scan')).toBe('scan-compressed.pdf');
	});

	it('sanitises unsafe characters', () => {
		expect(compressedFileName('a/b:c.pdf')).toBe('abc-compressed.pdf');
	});
});

describe('compressionSavings', () => {
	it('reports the fraction of bytes saved', () => {
		expect(compressionSavings(1000, 250)).toBeCloseTo(0.75);
		expect(compressionSavings(1000, 1000)).toBe(0);
	});

	it('clamps a document that grew to zero savings', () => {
		expect(compressionSavings(1000, 1500)).toBe(0);
	});

	it('returns zero for a missing original size', () => {
		expect(compressionSavings(0, 500)).toBe(0);
	});
});

describe('compress presets and defaults', () => {
	it('offers a sensible DPI ladder', () => {
		expect(COMPRESS_DPI_PRESETS).toContain(72);
		expect(COMPRESS_DPI_PRESETS).toContain(150);
		expect([...COMPRESS_DPI_PRESETS]).toEqual([...COMPRESS_DPI_PRESETS].sort((a, b) => a - b));
	});

	it('defaults to a mid DPI and lossy quality', () => {
		expect(DEFAULT_COMPRESS_OPTIONS.dpi).toBe(150);
		expect(DEFAULT_COMPRESS_OPTIONS.quality).toBeGreaterThan(0);
		expect(DEFAULT_COMPRESS_OPTIONS.quality).toBeLessThan(1);
	});
});
