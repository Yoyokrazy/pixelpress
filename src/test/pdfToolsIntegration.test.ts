import { PDFDocument, rgb } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { editPdfPages, inspectPdf, mergePdfs, splitPdf } from '../lib/pdfTools';

/** Build an in-memory PDF whose pages are distinguishable by size. */
async function makePdf(sizes: Array<[number, number]>): Promise<File> {
	const pdf = await PDFDocument.create();
	for (const [width, height] of sizes) {
		const page = pdf.addPage([width, height]);
		page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.9, 0.9, 0.95) });
	}
	const bytes = await pdf.save();
	return new File([bytes as unknown as BlobPart], 'sample.pdf', { type: 'application/pdf' });
}

async function pageSizes(blob: Blob): Promise<Array<{ width: number; height: number }>> {
	const pdf = await PDFDocument.load(await blob.arrayBuffer());
	return pdf.getPages().map((page) => {
		const { width, height } = page.getSize();
		return { width: Math.round(width), height: Math.round(height) };
	});
}

let threePage: File;
let twoPage: File;

beforeAll(async () => {
	// Distinct page sizes act as identifiers when checking ordering.
	threePage = await makePdf([
		[100, 200],
		[110, 210],
		[120, 220],
	]);
	twoPage = await makePdf([
		[300, 400],
		[310, 410],
	]);
});

describe('inspectPdf', () => {
	it('reports the page count and sizes', async () => {
		const info = await inspectPdf(threePage);
		expect(info.pageCount).toBe(3);
		expect(Math.round(info.sizes[0]!.width)).toBe(100);
		expect(Math.round(info.sizes[2]!.height)).toBe(220);
	});
});

describe('mergePdfs', () => {
	it('concatenates documents in the order supplied', async () => {
		const result = await mergePdfs(
			[{ file: threePage }, { file: twoPage }],
			'merged.pdf',
		);
		expect(result.pageCount).toBe(5);
		const sizes = await pageSizes(result.blob);
		expect(sizes[0]).toEqual({ width: 100, height: 200 });
		expect(sizes[3]).toEqual({ width: 300, height: 400 });
	});

	it('respects a reversed document order', async () => {
		const result = await mergePdfs([{ file: twoPage }, { file: threePage }], 'merged.pdf');
		const sizes = await pageSizes(result.blob);
		expect(sizes[0]).toEqual({ width: 300, height: 400 });
		expect(sizes[2]).toEqual({ width: 100, height: 200 });
	});

	it('honours a per-document page selection', async () => {
		const result = await mergePdfs(
			[
				{ file: threePage, pages: [3, 1] },
				{ file: twoPage, pages: [2] },
			],
			'merged.pdf',
		);
		expect(result.pageCount).toBe(3);
		const sizes = await pageSizes(result.blob);
		expect(sizes[0]).toEqual({ width: 120, height: 220 });
		expect(sizes[1]).toEqual({ width: 100, height: 200 });
		expect(sizes[2]).toEqual({ width: 310, height: 410 });
	});

	it('ignores out-of-range page selections', async () => {
		const result = await mergePdfs([{ file: threePage, pages: [1, 99, 0] }], 'merged.pdf');
		expect(result.pageCount).toBe(1);
	});

	it('appends a .pdf extension and sanitises the name', async () => {
		const result = await mergePdfs([{ file: twoPage }], 'my/report');
		expect(result.fileName).toBe('myreport.pdf');
	});

	it('reports progress for each document', async () => {
		const seen: number[] = [];
		await mergePdfs([{ file: threePage }, { file: twoPage }], 'm.pdf', (completed, total) => {
			seen.push(completed);
			expect(total).toBe(2);
		});
		expect(seen.length).toBeGreaterThan(0);
	});

	it('rejects an empty document list', async () => {
		await expect(mergePdfs([], 'merged.pdf')).rejects.toThrow(/at least one/i);
	});
});

describe('splitPdf', () => {
	it('splits every page into its own document', async () => {
		const outputs = await splitPdf(threePage, { mode: 'each', chunkSize: 1, ranges: '' });
		expect(outputs).toHaveLength(3);
		expect(outputs.every((output) => output.pageCount === 1)).toBe(true);
		expect(await pageSizes(outputs[2]!.blob)).toEqual([{ width: 120, height: 220 }]);
	});

	it('splits into fixed size chunks', async () => {
		const outputs = await splitPdf(threePage, { mode: 'every', chunkSize: 2, ranges: '' });
		expect(outputs.map((output) => output.pageCount)).toEqual([2, 1]);
	});

	it('splits by custom ranges', async () => {
		const outputs = await splitPdf(threePage, { mode: 'ranges', chunkSize: 1, ranges: '1-2; 3' });
		expect(outputs.map((output) => output.pageCount)).toEqual([2, 1]);
	});

	it('names outputs with their page span', async () => {
		const outputs = await splitPdf(threePage, { mode: 'every', chunkSize: 2, ranges: '' });
		expect(outputs[0]!.fileName).toMatch(/p1-2\.pdf$/);
		expect(outputs[1]!.fileName).toMatch(/p3\.pdf$/);
	});

	it('throws when the settings select nothing', async () => {
		await expect(
			splitPdf(threePage, { mode: 'ranges', chunkSize: 1, ranges: '99' }),
		).rejects.toThrow(/did not select any pages/i);
	});
});

describe('editPdfPages', () => {
	it('keeps only the pages that are not deleted', async () => {
		const result = await editPdfPages(threePage, [
			{ pageNumber: 1, rotation: 0, deleted: true },
			{ pageNumber: 2, rotation: 0, deleted: false },
			{ pageNumber: 3, rotation: 0, deleted: false },
		]);
		expect(result.pageCount).toBe(2);
		const sizes = await pageSizes(result.blob);
		expect(sizes[0]).toEqual({ width: 110, height: 210 });
	});

	it('writes pages in the order given, so reordering works', async () => {
		const result = await editPdfPages(threePage, [
			{ pageNumber: 3, rotation: 0, deleted: false },
			{ pageNumber: 1, rotation: 0, deleted: false },
			{ pageNumber: 2, rotation: 0, deleted: false },
		]);
		const sizes = await pageSizes(result.blob);
		expect(sizes).toEqual([
			{ width: 120, height: 220 },
			{ width: 100, height: 200 },
			{ width: 110, height: 210 },
		]);
	});

	it('applies rotation relative to the existing angle', async () => {
		const once = await editPdfPages(threePage, [{ pageNumber: 1, rotation: 90, deleted: false }]);
		const loaded = await PDFDocument.load(await once.blob.arrayBuffer());
		expect(loaded.getPage(0).getRotation().angle).toBe(90);
	});

	it('normalises rotation past a full turn', async () => {
		const result = await editPdfPages(threePage, [{ pageNumber: 1, rotation: 270, deleted: false }]);
		const loaded = await PDFDocument.load(await result.blob.arrayBuffer());
		expect(loaded.getPage(0).getRotation().angle).toBe(270);
	});

	it('refuses to produce an empty document', async () => {
		await expect(
			editPdfPages(threePage, [
				{ pageNumber: 1, rotation: 0, deleted: true },
				{ pageNumber: 2, rotation: 0, deleted: true },
				{ pageNumber: 3, rotation: 0, deleted: true },
			]),
		).rejects.toThrow(/at least one page/i);
	});

	it('derives a filename from the source when none is given', async () => {
		const result = await editPdfPages(threePage, [{ pageNumber: 1, rotation: 0, deleted: false }]);
		expect(result.fileName).toBe('sample-edited.pdf');
	});
});
