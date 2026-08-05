import { describe, expect, it } from 'vitest';
import {
	ACCEPTED_IMAGE_TYPES,
	IMAGE_ACCEPT_ATTRIBUTE,
	effectiveSize,
	isImageFile,
	isPdfFile,
	nextId,
	normaliseImageType,
} from '../lib/images';
import type { ImageItem } from '../lib/types';

function makeFile(name: string, type: string): File {
	return new File([], name, { type });
}

function makeImageItem(overrides: Partial<ImageItem> = {}): ImageItem {
	return {
		id: 'img-1-abc',
		file: makeFile('test.png', 'image/png'),
		name: 'test.png',
		size: 100,
		lastModified: 0,
		previewUrl: 'blob:test',
		width: 800,
		height: 600,
		rotation: 0,
		exifOrientation: 1,
		type: 'image/png',
		...overrides,
	};
}

describe('isImageFile', () => {
	it('accepts all ACCEPTED_IMAGE_TYPES', () => {
		for (const type of ACCEPTED_IMAGE_TYPES) {
			const file = makeFile(`image.${type.split('/')[1]}`, type);
			expect(isImageFile(file), `${type} should be accepted`).toBe(true);
		}
	});

	it('rejects a PDF file', () => {
		expect(isImageFile(makeFile('doc.pdf', 'application/pdf'))).toBe(false);
	});

	it('rejects an unknown mime type', () => {
		expect(isImageFile(makeFile('data.bin', 'application/octet-stream'))).toBe(false);
	});

	it('falls back to extension when type is empty', () => {
		expect(isImageFile(makeFile('photo.jpg', ''))).toBe(true);
		expect(isImageFile(makeFile('photo.png', ''))).toBe(true);
		expect(isImageFile(makeFile('photo.svg', ''))).toBe(true);
	});
});

describe('isPdfFile', () => {
	it('accepts application/pdf by mime type', () => {
		expect(isPdfFile(makeFile('doc.pdf', 'application/pdf'))).toBe(true);
	});

	it('accepts .pdf extension regardless of mime type', () => {
		expect(isPdfFile(makeFile('doc.pdf', ''))).toBe(true);
		expect(isPdfFile(makeFile('DOCUMENT.PDF', ''))).toBe(true);
	});

	it('rejects image files', () => {
		expect(isPdfFile(makeFile('photo.png', 'image/png'))).toBe(false);
	});
});

describe('normaliseImageType', () => {
	it('returns the file mime type when present', () => {
		expect(normaliseImageType(makeFile('a.png', 'image/png'))).toBe('image/png');
	});

	it('falls back to extension when type is application/octet-stream', () => {
		expect(normaliseImageType(makeFile('a.jpg', 'application/octet-stream'))).toBe('image/jpeg');
		expect(normaliseImageType(makeFile('a.tiff', 'application/octet-stream'))).toBe('image/tiff');
		expect(normaliseImageType(makeFile('a.tif', 'application/octet-stream'))).toBe('image/tiff');
		expect(normaliseImageType(makeFile('a.bmp', 'application/octet-stream'))).toBe('image/bmp');
		expect(normaliseImageType(makeFile('a.avif', 'application/octet-stream'))).toBe('image/avif');
		expect(normaliseImageType(makeFile('a.svg', 'application/octet-stream'))).toBe('image/svg+xml');
	});

	it('falls back to extension when type is empty', () => {
		expect(normaliseImageType(makeFile('photo.webp', ''))).toBe('image/webp');
		expect(normaliseImageType(makeFile('photo.gif', ''))).toBe('image/gif');
	});

	it('returns empty string for unknown extension with no type', () => {
		expect(normaliseImageType(makeFile('file.xyz', ''))).toBe('');
	});

	it('normalises jpe extension to image/jpeg', () => {
		expect(normaliseImageType(makeFile('photo.jpe', 'application/octet-stream'))).toBe('image/jpeg');
	});
});

describe('nextId', () => {
	it('returns a string starting with the given prefix', () => {
		const id = nextId('img');
		expect(id).toMatch(/^img-/);
	});

	it('returns different IDs on each call', () => {
		const a = nextId('img');
		const b = nextId('img');
		expect(a).not.toBe(b);
	});

	it('ids are monotonically increasing by counter', () => {
		const a = nextId('x');
		const b = nextId('x');
		const counterA = parseInt(a.split('-')[1], 10);
		const counterB = parseInt(b.split('-')[1], 10);
		expect(counterB).toBeGreaterThan(counterA);
	});
});

describe('effectiveSize', () => {
	it('returns original dimensions when rotation is 0', () => {
		expect(effectiveSize(makeImageItem({ width: 800, height: 600, rotation: 0 }))).toEqual({
			width: 800,
			height: 600,
		});
	});

	it('swaps dimensions when rotation is 90', () => {
		expect(effectiveSize(makeImageItem({ width: 800, height: 600, rotation: 90 }))).toEqual({
			width: 600,
			height: 800,
		});
	});

	it('preserves dimensions when rotation is 180', () => {
		expect(effectiveSize(makeImageItem({ width: 800, height: 600, rotation: 180 }))).toEqual({
			width: 800,
			height: 600,
		});
	});

	it('swaps dimensions when rotation is 270', () => {
		expect(effectiveSize(makeImageItem({ width: 800, height: 600, rotation: 270 }))).toEqual({
			width: 600,
			height: 800,
		});
	});
});

describe('ACCEPTED_IMAGE_TYPES and IMAGE_ACCEPT_ATTRIBUTE', () => {
	it('ACCEPTED_IMAGE_TYPES includes common formats', () => {
		expect(ACCEPTED_IMAGE_TYPES).toContain('image/png');
		expect(ACCEPTED_IMAGE_TYPES).toContain('image/jpeg');
		expect(ACCEPTED_IMAGE_TYPES).toContain('image/webp');
		expect(ACCEPTED_IMAGE_TYPES).toContain('image/svg+xml');
	});

	it('IMAGE_ACCEPT_ATTRIBUTE includes extension aliases', () => {
		expect(IMAGE_ACCEPT_ATTRIBUTE).toContain('.jpg');
		expect(IMAGE_ACCEPT_ATTRIBUTE).toContain('.jpeg');
		expect(IMAGE_ACCEPT_ATTRIBUTE).toContain('.tiff');
	});
});
