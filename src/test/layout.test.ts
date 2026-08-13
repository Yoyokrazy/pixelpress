import { describe, expect, it } from 'vitest';
import { chunk, fitRect, gridCells, gridShape, rotateClockwise, rotateCounterClockwise, rotatedSize } from '../lib/layout';

describe('fitRect', () => {
	it('contains a wide image inside a square box', () => {
		const box = fitRect(200, 100, 100, 100, 'contain');
		expect(box.width).toBe(100);
		expect(box.height).toBe(50);
		expect(box.x).toBe(0);
		expect(box.y).toBe(25);
	});

	it('contains a tall image inside a square box', () => {
		const box = fitRect(100, 200, 100, 100, 'contain');
		expect(box.width).toBe(50);
		expect(box.height).toBe(100);
		expect(box.x).toBe(25);
		expect(box.y).toBe(0);
	});

	it('covers the box, overflowing on one axis', () => {
		const box = fitRect(200, 100, 100, 100, 'cover');
		expect(box.width).toBe(200);
		expect(box.height).toBe(100);
		expect(box.x).toBe(-50);
		expect(box.y).toBe(0);
	});

	it('stretches to fill exactly', () => {
		const box = fitRect(200, 100, 100, 300, 'stretch');
		expect(box).toEqual({ x: 0, y: 0, width: 100, height: 300 });
	});

	it('preserves the aspect ratio when containing', () => {
		const box = fitRect(1600, 900, 400, 400, 'contain');
		expect(box.width / box.height).toBeCloseTo(1600 / 900, 5);
	});

	it('handles degenerate inputs without dividing by zero', () => {
		expect(fitRect(0, 0, 100, 50, 'contain')).toEqual({ x: 0, y: 0, width: 100, height: 50 });
		expect(fitRect(100, 50, 0, 0, 'contain')).toEqual({ x: 0, y: 0, width: 0, height: 0 });
	});
});

describe('rotation helpers', () => {
	it('swaps dimensions on quarter turns only', () => {
		expect(rotatedSize(200, 100, 0)).toEqual({ width: 200, height: 100 });
		expect(rotatedSize(200, 100, 90)).toEqual({ width: 100, height: 200 });
		expect(rotatedSize(200, 100, 180)).toEqual({ width: 200, height: 100 });
		expect(rotatedSize(200, 100, 270)).toEqual({ width: 100, height: 200 });
	});

	it('cycles clockwise and counter-clockwise', () => {
		expect(rotateClockwise(0)).toBe(90);
		expect(rotateClockwise(270)).toBe(0);
		expect(rotateCounterClockwise(0)).toBe(270);
		expect(rotateCounterClockwise(90)).toBe(0);
	});
});

describe('gridShape', () => {
	it('splits along the long edge for two-up', () => {
		expect(gridShape(2, 800, 400)).toEqual({ columns: 2, rows: 1 });
		expect(gridShape(2, 400, 800)).toEqual({ columns: 1, rows: 2 });
	});

	it('uses square grids for four and nine up', () => {
		expect(gridShape(4, 400, 800)).toEqual({ columns: 2, rows: 2 });
		expect(gridShape(9, 400, 800)).toEqual({ columns: 3, rows: 3 });
	});

	it('collapses to a single cell for one image', () => {
		expect(gridShape(1, 400, 800)).toEqual({ columns: 1, rows: 1 });
	});

	it('falls back to a ceil-sqrt grid for counts without a fixed shape', () => {
		// 3 → ceil(sqrt(3)) = 2 columns, ceil(3/2) = 2 rows.
		expect(gridShape(3, 400, 800)).toEqual({ columns: 2, rows: 2 });
		// 5 → 3 columns, 2 rows.
		expect(gridShape(5, 400, 800)).toEqual({ columns: 3, rows: 2 });
		// 7 → 3 columns, 3 rows.
		expect(gridShape(7, 400, 800)).toEqual({ columns: 3, rows: 3 });
	});
});

describe('gridCells', () => {
	it('produces the requested number of cells', () => {
		expect(gridCells(600, 800, 0, 4)).toHaveLength(4);
		expect(gridCells(600, 800, 20, 9, 5)).toHaveLength(9);
	});

	it('fills the usable area exactly with no gutter', () => {
		const cells = gridCells(600, 800, 0, 4);
		expect(cells[0]!.width).toBe(300);
		expect(cells[0]!.height).toBe(400);
	});

	it('lays cells out in reading order using PDF coordinates', () => {
		const cells = gridCells(600, 800, 0, 4);
		// First cell is the top-left, so it has the highest y in PDF space.
		expect(cells[0]!.x).toBe(0);
		expect(cells[0]!.y).toBe(400);
		expect(cells[1]!.x).toBe(300);
		expect(cells[1]!.y).toBe(400);
		expect(cells[2]!.y).toBe(0);
	});

	it('keeps every cell inside the page bounds', () => {
		for (const cell of gridCells(600, 800, 30, 6, 10)) {
			expect(cell.x).toBeGreaterThanOrEqual(30);
			expect(cell.y).toBeGreaterThanOrEqual(30);
			expect(cell.x + cell.width).toBeLessThanOrEqual(570 + 1e-9);
			expect(cell.y + cell.height).toBeLessThanOrEqual(770 + 1e-9);
		}
	});
});

describe('chunk', () => {
	it('splits into fixed size groups with a short tail', () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
	});

	it('returns one group when the size covers everything', () => {
		expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
	});

	it('handles an empty list', () => {
		expect(chunk([], 3)).toEqual([]);
	});

	it('returns a single group when the size is zero or negative', () => {
		expect(chunk([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
		expect(chunk([1, 2, 3], -5)).toEqual([[1, 2, 3]]);
	});

	it('copies the input rather than aliasing it for the guard path', () => {
		const source = [1, 2, 3];
		const result = chunk(source, 0);
		expect(result[0]).not.toBe(source);
		expect(result[0]).toEqual(source);
	});
});
