import { describe, expect, it } from 'vitest';
import {
	effectiveSize,
	IMAGE_ACCEPT_ATTRIBUTE,
	isImageFile,
	isPdfFile,
	nextId,
	normaliseImageType,
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
