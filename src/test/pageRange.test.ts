import { describe, expect, it } from 'vitest';
import { formatPageRange, parsePageRange } from '../lib/pageRange';

describe('parsePageRange', () => {
	it('selects every page for an empty expression', () => {
		expect(parsePageRange('', 4).pages).toEqual([1, 2, 3, 4]);
		expect(parsePageRange('   ', 3).pages).toEqual([1, 2, 3]);
	});

	it('parses single pages and comma separated lists', () => {
		expect(parsePageRange('2', 5).pages).toEqual([2]);
		expect(parsePageRange('1,3,5', 5).pages).toEqual([1, 3, 5]);
		expect(parsePageRange('5 1 3', 5).pages).toEqual([1, 3, 5]);
	});

	it('parses closed ranges', () => {
		expect(parsePageRange('2-4', 10).pages).toEqual([2, 3, 4]);
		expect(parsePageRange('2–4', 10).pages).toEqual([2, 3, 4]);
	});

	it('parses open-ended ranges', () => {
		expect(parsePageRange('7-', 9).pages).toEqual([7, 8, 9]);
		expect(parsePageRange('-3', 9).pages).toEqual([1, 2, 3]);
	});

	it('normalises reversed ranges', () => {
		expect(parsePageRange('5-2', 10).pages).toEqual([2, 3, 4, 5]);
	});

	it('deduplicates and sorts overlapping selections', () => {
		expect(parsePageRange('3, 1-4, 2', 6).pages).toEqual([1, 2, 3, 4]);
	});

	it('supports keywords', () => {
		expect(parsePageRange('odd', 7).pages).toEqual([1, 3, 5, 7]);
		expect(parsePageRange('even', 7).pages).toEqual([2, 4, 6]);
		expect(parsePageRange('first', 7).pages).toEqual([1]);
		expect(parsePageRange('last', 7).pages).toEqual([7]);
		expect(parsePageRange('all', 3).pages).toEqual([1, 2, 3]);
		expect(parsePageRange('first, last', 7).pages).toEqual([1, 7]);
	});

	it('clamps out-of-bounds ranges and reports them', () => {
		const result = parsePageRange('3-99', 5);
		expect(result.pages).toEqual([3, 4, 5]);
		expect(result.errors).toHaveLength(1);
	});

	it('reports invalid tokens without discarding valid ones', () => {
		const result = parsePageRange('2, banana, 4', 5);
		expect(result.pages).toEqual([2, 4]);
		expect(result.errors[0]).toContain('banana');
	});

	it('rejects pages outside the document', () => {
		const result = parsePageRange('9', 5);
		expect(result.pages).toEqual([]);
		expect(result.errors).toHaveLength(1);
	});

	it('returns nothing for an empty document', () => {
		expect(parsePageRange('1-3', 0).pages).toEqual([]);
	});
});

describe('formatPageRange', () => {
	it('collapses consecutive runs', () => {
		expect(formatPageRange([1, 2, 3, 7])).toBe('1-3, 7');
		expect(formatPageRange([2, 4, 6])).toBe('2, 4, 6');
		expect(formatPageRange([5])).toBe('5');
		expect(formatPageRange([])).toBe('');
	});

	it('sorts and deduplicates before formatting', () => {
		expect(formatPageRange([3, 1, 2, 3])).toBe('1-3');
	});

	it('round-trips through the parser', () => {
		const expression = '1-3, 5, 9-10';
		const parsed = parsePageRange(expression, 10);
		expect(formatPageRange(parsed.pages)).toBe('1-3, 5, 9-10');
	});
});
