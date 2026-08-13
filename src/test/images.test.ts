import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
	effectiveSize,
	IMAGE_ACCEPT_ATTRIBUTE,
	isImageFile,
	isPdfFile,
	nextId,
	normaliseImageType,
	prepareImageForPdf,
} from '../lib/images';
import type { ImageItem } from '../lib/types';

function file(name: string, type = ''): File {
	return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('normaliseImageType', () => {
	it('trusts a specific type reported by the browser', () => {
		expect(normaliseImageType(file('a.png', 'image/png'))).toBe('image/png');
		expect(normaliseImageType(file('a.bin', 'image/webp'))).toBe('image/webp');
	});

	it('falls back to the extension when the browser reports nothing', () => {
		expect(normaliseImageType(file('photo.png'))).toBe('image/png');
		expect(normaliseImageType(file('photo.jpg'))).toBe('image/jpeg');
		expect(normaliseImageType(file('photo.jpeg'))).toBe('image/jpeg');
		expect(normaliseImageType(file('photo.webp'))).toBe('image/webp');
		expect(normaliseImageType(file('photo.tif'))).toBe('image/tiff');
		expect(normaliseImageType(file('photo.svg'))).toBe('image/svg+xml');
	});

	it('falls back to the extension for a vague octet-stream', () => {
		expect(normaliseImageType(file('photo.png', 'application/octet-stream'))).toBe('image/png');
	});

	it('is case-insensitive about the extension', () => {
		expect(normaliseImageType(file('PHOTO.PNG'))).toBe('image/png');
		expect(normaliseImageType(file('Photo.JPeG'))).toBe('image/jpeg');
	});

	it('returns an empty type for an unknown extension', () => {
		expect(normaliseImageType(file('notes.txt'))).toBe('');
		expect(normaliseImageType(file('noextension'))).toBe('');
	});
});

describe('isImageFile', () => {
	it('accepts every supported format, typed or by extension', () => {
		for (const name of ['a.png', 'a.jpg', 'a.webp', 'a.gif', 'a.bmp', 'a.avif', 'a.tiff', 'a.svg']) {
			expect(isImageFile(file(name)), name).toBe(true);
		}
		expect(isImageFile(file('blob', 'image/png'))).toBe(true);
	});

	it('rejects non-images', () => {
		expect(isImageFile(file('doc.pdf', 'application/pdf'))).toBe(false);
		expect(isImageFile(file('notes.txt', 'text/plain'))).toBe(false);
		expect(isImageFile(file('mystery'))).toBe(false);
	});
});

describe('isPdfFile', () => {
	it('accepts PDFs by MIME type or extension', () => {
		expect(isPdfFile(file('doc.pdf', 'application/pdf'))).toBe(true);
		expect(isPdfFile(file('doc.pdf'))).toBe(true);
		expect(isPdfFile(file('DOC.PDF'))).toBe(true);
		expect(isPdfFile(file('untitled', 'application/pdf'))).toBe(true);
	});

	it('rejects everything else', () => {
		expect(isPdfFile(file('a.png', 'image/png'))).toBe(false);
		expect(isPdfFile(file('pdf.txt'))).toBe(false);
	});
});

describe('nextId', () => {
	it('keeps the prefix and stays unique across calls', () => {
		const ids = Array.from({ length: 200 }, () => nextId('img'));
		expect(ids.every((id) => id.startsWith('img-'))).toBe(true);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('does not mix ids between prefixes', () => {
		expect(nextId('page')).toMatch(/^page-/);
		expect(nextId('doc')).toMatch(/^doc-/);
	});
});

describe('effectiveSize', () => {
	const base: ImageItem = {
		id: 'a',
		file: file('a.png', 'image/png'),
		name: 'a.png',
		size: 3,
		lastModified: 0,
		previewUrl: '',
		width: 400,
		height: 250,
		rotation: 0,
		exifOrientation: 1,
		type: 'image/png',
	};

	it('leaves dimensions alone for half turns', () => {
		expect(effectiveSize({ ...base, rotation: 0 })).toEqual({ width: 400, height: 250 });
		expect(effectiveSize({ ...base, rotation: 180 })).toEqual({ width: 400, height: 250 });
	});

	it('swaps dimensions for quarter turns', () => {
		expect(effectiveSize({ ...base, rotation: 90 })).toEqual({ width: 250, height: 400 });
		expect(effectiveSize({ ...base, rotation: 270 })).toEqual({ width: 250, height: 400 });
	});
});

describe('IMAGE_ACCEPT_ATTRIBUTE', () => {
	it('lists both MIME types and extensions so pickers behave everywhere', () => {
		expect(IMAGE_ACCEPT_ATTRIBUTE).toContain('image/png');
		expect(IMAGE_ACCEPT_ATTRIBUTE).toContain('.png');
		expect(IMAGE_ACCEPT_ATTRIBUTE).toContain('.jpeg');
		expect(IMAGE_ACCEPT_ATTRIBUTE).not.toContain('application/pdf');
	});
});

// A small truecolour PNG carrying a tEXt metadata chunk, built without canvas.
function crc32(buffer: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of buffer) {
		crc ^= byte;
		for (let k = 0; k < 8; k += 1) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): number[] {
	const len = [(data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff];
	const body = Uint8Array.from([...[...type].map((c) => c.charCodeAt(0)), ...data]);
	const crc = crc32(body);
	return [...len, ...body, (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff];
}

function pngWithMetadata(): Uint8Array {
	const ihdr = new Uint8Array(13);
	const dv = new DataView(ihdr.buffer);
	dv.setUint32(0, 4);
	dv.setUint32(4, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	const idat = deflateSync(new Uint8Array((4 * 3 + 1) * 4));
	return Uint8Array.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		...pngChunk('IHDR', ihdr),
		...pngChunk('tEXt', Uint8Array.from([...'Comment\0secret'].map((c) => c.charCodeAt(0)))),
		...pngChunk('IDAT', new Uint8Array(idat)),
		...pngChunk('IEND', new Uint8Array(0)),
	]);
}

function pngItem(bytes: Uint8Array): ImageItem {
	return {
		id: 'png',
		file: new File([bytes as unknown as BlobPart], 'a.png', { type: 'image/png' }),
		name: 'a.png',
		size: bytes.byteLength,
		lastModified: 0,
		previewUrl: '',
		width: 4,
		height: 4,
		rotation: 0,
		exifOrientation: 1,
		type: 'image/png',
	};
}

describe('prepareImageForPdf metadata stripping', () => {
	const baseOptions = { compress: false, jpegQuality: 0.85, maxDimension: 0, backgroundColor: '#ffffff' };

	function hasTextChunk(bytes: Uint8Array): boolean {
		for (let i = 8; i + 8 <= bytes.length; i += 1) {
			if (bytes[i + 4] === 0x74 && bytes[i + 5] === 0x45 && bytes[i + 6] === 0x58 && bytes[i + 7] === 0x74) {
				return true;
			}
		}
		return false;
	}

	it('keeps metadata on the passthrough path by default', async () => {
		const bytes = pngWithMetadata();
		const result = await prepareImageForPdf(pngItem(bytes), baseOptions);
		expect(result.type).toBe('image/png');
		expect(hasTextChunk(result.bytes)).toBe(true);
	});

	it('strips metadata losslessly when asked', async () => {
		const bytes = pngWithMetadata();
		const result = await prepareImageForPdf(pngItem(bytes), { ...baseOptions, stripMetadata: true });
		expect(result.type).toBe('image/png');
		expect(hasTextChunk(result.bytes)).toBe(false);
		expect(result.bytes.length).toBeLessThan(bytes.length);
		// Same pixels: dimensions are unchanged.
		expect(result.width).toBe(4);
		expect(result.height).toBe(4);
	});
});
