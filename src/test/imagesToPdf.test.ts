import { PDFDocument } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildPdfFromImages, DEFAULT_PDF_OPTIONS } from '../lib/imagesToPdf';
import type { ImageItem, PdfBuildOptions } from '../lib/types';
import { mmToPoints } from '../lib/pageSizes';
import { deflateSync } from 'node:zlib';

/**
 * Build a minimal but valid PNG. Encoding it by hand keeps these tests free of
 * canvas, so the PDF builder's passthrough path can be exercised in jsdom.
 */
function encodePng(width: number, height: number): Uint8Array {
	const raw = Buffer.alloc((width * 3 + 1) * height);
	let offset = 0;
	for (let y = 0; y < height; y += 1) {
		raw[offset] = 0; // filter: none
		offset += 1;
		for (let x = 0; x < width; x += 1) {
			raw[offset] = 200;
			raw[offset + 1] = 60;
			raw[offset + 2] = 90;
			offset += 3;
		}
	}

	const chunk = (type: string, data: Buffer): Buffer => {
		const length = Buffer.alloc(4);
		length.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(crc32(body) >>> 0);
		return Buffer.concat([length, body, crc]);
	};

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // colour type: truecolour

	return new Uint8Array(
		Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			chunk('IHDR', ihdr),
			chunk('IDAT', deflateSync(raw)),
			chunk('IEND', Buffer.alloc(0)),
		]),
	);
}

let crcTable: number[] | undefined;
function crc32(buffer: Buffer): number {
	if (!crcTable) {
		crcTable = [];
		for (let n = 0; n < 256; n += 1) {
			let c = n;
			for (let k = 0; k < 8; k += 1) {
				c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			}
			crcTable[n] = c;
		}
	}
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return crc ^ 0xffffffff;
}

function imageItem(name: string, width: number, height: number): ImageItem {
	const bytes = encodePng(width, height);
	const file = new File([bytes as unknown as BlobPart], name, { type: 'image/png' });
	return {
		id: name,
		file,
		name,
		size: bytes.byteLength,
		lastModified: Date.now(),
		previewUrl: '',
		width,
		height,
		rotation: 0,
		exifOrientation: 1,
		type: 'image/png',
	};
}

/**
 * A tiny but valid 8×8 baseline JPEG. Passing an already-JPEG file straight
 * through exercises pdf-lib's `embedJpg` branch without needing a canvas.
 */
const JPEG_8X8_BASE64 =
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ANCv/9k=';

function jpegItem(name: string): ImageItem {
	const binary = atob(JPEG_8X8_BASE64);
	const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
	const file = new File([bytes as unknown as BlobPart], name, { type: 'image/jpeg' });
	return {
		id: name,
		file,
		name,
		size: bytes.byteLength,
		lastModified: Date.now(),
		previewUrl: '',
		width: 8,
		height: 8,
		rotation: 0,
		exifOrientation: 1,
		type: 'image/jpeg',
	};
}

function options(overrides: Partial<PdfBuildOptions> = {}): PdfBuildOptions {
	return { ...DEFAULT_PDF_OPTIONS, ...overrides };
}

async function pagesOf(blob: Blob) {
	const pdf = await PDFDocument.load(await blob.arrayBuffer());
	return pdf.getPages().map((page) => {
		const { width, height } = page.getSize();
		return { width: Math.round(width), height: Math.round(height) };
	});
}

let landscape: ImageItem;
let portrait: ImageItem;

beforeAll(() => {
	landscape = imageItem('landscape.png', 40, 20);
	portrait = imageItem('portrait.png', 20, 40);
});

describe('buildPdfFromImages', () => {
	it('creates one page per image by default', async () => {
		const result = await buildPdfFromImages([landscape, portrait], options());
		expect(result.pageCount).toBe(2);
		expect(result.blob.type).toBe('application/pdf');
		expect(result.byteLength).toBeGreaterThan(0);
	});

	it('sizes auto pages to match the image', async () => {
		const result = await buildPdfFromImages([landscape], options());
		expect(await pagesOf(result.blob)).toEqual([{ width: 40, height: 20 }]);
	});

	it('expands the auto page to make room for margins', async () => {
		const margin = 10;
		const result = await buildPdfFromImages([landscape], options({ marginMm: margin }));
		const expected = Math.round(40 + mmToPoints(margin) * 2);
		expect((await pagesOf(result.blob))[0].width).toBe(expected);
	});

	it('uses a fixed page size when a preset is chosen', async () => {
		const result = await buildPdfFromImages(
			[landscape],
			options({ pageSizeId: 'a4', orientation: 'portrait' }),
		);
		expect(await pagesOf(result.blob)).toEqual([{ width: 595, height: 842 }]);
	});

	it('follows the image aspect ratio in auto orientation', async () => {
		const wide = await buildPdfFromImages([landscape], options({ pageSizeId: 'a4' }));
		const tall = await buildPdfFromImages([portrait], options({ pageSizeId: 'a4' }));
		expect((await pagesOf(wide.blob))[0].width).toBeGreaterThan((await pagesOf(wide.blob))[0].height);
		expect((await pagesOf(tall.blob))[0].height).toBeGreaterThan((await pagesOf(tall.blob))[0].width);
	});

	it('honours a custom page size in millimetres', async () => {
		const result = await buildPdfFromImages(
			[landscape],
			options({ pageSizeId: 'custom', customWidthMm: 100, customHeightMm: 150, orientation: 'portrait' }),
		);
		expect(await pagesOf(result.blob)).toEqual([
			{ width: Math.round(mmToPoints(100)), height: Math.round(mmToPoints(150)) },
		]);
	});

	it('packs several images onto one page for N-up layouts', async () => {
		const four = [landscape, portrait, landscape, portrait];
		const result = await buildPdfFromImages(four, options({ imagesPerPage: 4 }));
		expect(result.pageCount).toBe(1);
	});

	it('starts a new page once the grid is full', async () => {
		const five = [landscape, portrait, landscape, portrait, landscape];
		const result = await buildPdfFromImages(five, options({ imagesPerPage: 4 }));
		expect(result.pageCount).toBe(2);
	});

	it('writes the supplied metadata', async () => {
		const result = await buildPdfFromImages(
			[landscape],
			options({ title: 'My title', author: 'Ada', subject: 'Testing', keywords: 'a, b' }),
		);
		const pdf = await PDFDocument.load(await result.blob.arrayBuffer());
		expect(pdf.getTitle()).toBe('My title');
		expect(pdf.getAuthor()).toBe('Ada');
		expect(pdf.getSubject()).toBe('Testing');
		expect(pdf.getKeywords()).toContain('a');
		expect(pdf.getCreator()).toMatch(/PixelPress/);
	});

	it('normalises the output filename', async () => {
		const named = await buildPdfFromImages([landscape], options({ fileName: 'my/report' }));
		expect(named.fileName).toBe('myreport.pdf');
		const bare = await buildPdfFromImages([landscape], options({ fileName: 'report' }));
		expect(bare.fileName).toBe('report.pdf');
	});

	it('reports progress up to the image count', async () => {
		const seen: Array<[number, number]> = [];
		await buildPdfFromImages([landscape, portrait], options(), (current, total) =>
			seen.push([current, total]),
		);
		expect(seen.at(-1)).toEqual([2, 2]);
	});

	it('rejects an empty image list', async () => {
		await expect(buildPdfFromImages([], options())).rejects.toThrow(/at least one image/i);
	});

	it('aborts when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			buildPdfFromImages([landscape], options(), undefined, controller.signal),
		).rejects.toThrow(/cancelled/i);
	});

	it('produces a larger document for more images', async () => {
		const one = await buildPdfFromImages([landscape], options());
		const many = await buildPdfFromImages([landscape, portrait, landscape], options());
		expect(many.byteLength).toBeGreaterThan(one.byteLength);
	});

	it.each(['contain', 'cover', 'stretch'] as const)('supports %s scaling', async (fit) => {
		const result = await buildPdfFromImages([landscape], options({ pageSizeId: 'a4', fit }));
		expect(result.pageCount).toBe(1);
	});

	it('embeds a JPEG source through the passthrough path', async () => {
		const result = await buildPdfFromImages([jpegItem('photo.jpg')], options());
		expect(result.pageCount).toBe(1);
		expect(await pagesOf(result.blob)).toEqual([{ width: 8, height: 8 }]);
	});

	it('embeds a mix of PNG and JPEG sources', async () => {
		const result = await buildPdfFromImages([landscape, jpegItem('photo.jpg')], options());
		expect(result.pageCount).toBe(2);
		expect(result.byteLength).toBeGreaterThan(0);
	});
});
