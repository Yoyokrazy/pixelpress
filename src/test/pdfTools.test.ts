import { describe, expect, it } from 'vitest';
import { planSplit, type SplitOptions } from '../lib/pdfTools';

const base: SplitOptions = { mode: 'each', chunkSize: 1, ranges: '' };

describe('planSplit', () => {
	it('splits every page into its own document', () => {
		expect(planSplit({ ...base, mode: 'each' }, 3)).toEqual([[1], [2], [3]]);
	});

	it('splits into fixed size chunks with a short final group', () => {
		expect(planSplit({ ...base, mode: 'every', chunkSize: 2 }, 5)).toEqual([
			[1, 2],
			[3, 4],
			[5],
		]);
	});

	it('treats a chunk size larger than the document as a single group', () => {
		expect(planSplit({ ...base, mode: 'every', chunkSize: 50 }, 3)).toEqual([[1, 2, 3]]);
	});

	it('clamps a non-positive chunk size to one', () => {
		expect(planSplit({ ...base, mode: 'every', chunkSize: 0 }, 3)).toEqual([[1], [2], [3]]);
	});

	it('parses semicolon separated custom ranges', () => {
		expect(planSplit({ ...base, mode: 'ranges', ranges: '1-2; 4' }, 6)).toEqual([[1, 2], [4]]);
	});

	it('supports open-ended custom ranges', () => {
		expect(planSplit({ ...base, mode: 'ranges', ranges: '3-' }, 5)).toEqual([[3, 4, 5]]);
	});

	it('drops range groups that select nothing', () => {
		expect(planSplit({ ...base, mode: 'ranges', ranges: '1-2; ; 99' }, 4)).toEqual([[1, 2]]);
	});

	it('returns nothing for an empty document', () => {
		expect(planSplit({ ...base, mode: 'each' }, 0)).toEqual([]);
		expect(planSplit({ ...base, mode: 'every', chunkSize: 2 }, 0)).toEqual([]);
	});

	it('covers every page exactly once when chunking', () => {
		const flattened = planSplit({ ...base, mode: 'every', chunkSize: 3 }, 10).flat();
		expect(flattened).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});
});
