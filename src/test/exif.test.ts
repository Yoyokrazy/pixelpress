import { describe, expect, it } from 'vitest';
import { DEFAULT_ORIENTATION, readExifOrientation } from '../lib/exif';

/** Build a JPEG whose APP1 segment carries the given EXIF orientation. */
function jpegWithOrientation(orientation: number, littleEndian = true): Blob {
	const tiff: number[] = [];
	const push16 = (value: number) => {
		if (littleEndian) {
			tiff.push(value & 0xff, (value >> 8) & 0xff);
		} else {
			tiff.push((value >> 8) & 0xff, value & 0xff);
		}
	};
	const push32 = (value: number) => {
		if (littleEndian) {
			tiff.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
		} else {
			tiff.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
		}
	};

	tiff.push(littleEndian ? 0x49 : 0x4d, littleEndian ? 0x49 : 0x4d);
	push16(0x002a);
	push32(8); // IFD0 begins immediately after the header.
	push16(1); // One entry.
	push16(0x0112); // Orientation tag.
	push16(3); // SHORT.
	push32(1); // One value.
	push16(orientation);
	push16(0); // Padding for the 4-byte value slot.
	push32(0); // No next IFD.

	const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
	const length = exif.length + 2;
	const bytes = [
		0xff,
		0xd8, // SOI
		0xff,
		0xe1, // APP1
		(length >> 8) & 0xff,
		length & 0xff,
		...exif,
		0xff,
		0xda, // SOS
		0x00,
		0x02,
	];
	return new Blob([new Uint8Array(bytes)]);
}

/** Build a PNG whose eXIf chunk carries the given orientation. */
function pngWithOrientation(orientation: number): Blob {
	const tiff = [
		0x49, 0x49, 0x2a, 0x00,
		0x08, 0x00, 0x00, 0x00,
		0x01, 0x00,
		0x12, 0x01,
		0x03, 0x00,
		0x01, 0x00, 0x00, 0x00,
		orientation & 0xff, (orientation >> 8) & 0xff, 0x00, 0x00,
		0x00, 0x00, 0x00, 0x00,
	];
	const length = tiff.length;
	const bytes = [
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		(length >> 24) & 0xff, (length >> 16) & 0xff, (length >> 8) & 0xff, length & 0xff,
		0x65, 0x58, 0x49, 0x66, // "eXIf"
		...tiff,
		0x00, 0x00, 0x00, 0x00, // CRC placeholder
	];
	return new Blob([new Uint8Array(bytes)]);
}

describe('readExifOrientation', () => {
	it('reads a little-endian JPEG orientation', async () => {
		await expect(readExifOrientation(jpegWithOrientation(6))).resolves.toBe(6);
		await expect(readExifOrientation(jpegWithOrientation(3))).resolves.toBe(3);
		await expect(readExifOrientation(jpegWithOrientation(8))).resolves.toBe(8);
	});

	it('reads a big-endian JPEG orientation', async () => {
		await expect(readExifOrientation(jpegWithOrientation(6, false))).resolves.toBe(6);
	});

	it('returns the default for an unrotated JPEG', async () => {
		await expect(readExifOrientation(jpegWithOrientation(1))).resolves.toBe(DEFAULT_ORIENTATION);
	});

	it('reads orientation from a PNG eXIf chunk', async () => {
		await expect(readExifOrientation(pngWithOrientation(6))).resolves.toBe(6);
	});

	it('returns the default when there is no EXIF block', async () => {
		const plainJpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])]);
		await expect(readExifOrientation(plainJpeg)).resolves.toBe(DEFAULT_ORIENTATION);
	});

	it('returns the default for a non-image blob', async () => {
		await expect(readExifOrientation(new Blob(['not an image']))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('returns the default for an empty blob', async () => {
		await expect(readExifOrientation(new Blob([]))).resolves.toBe(DEFAULT_ORIENTATION);
	});

	it('rejects out-of-range orientation values', async () => {
		await expect(readExifOrientation(jpegWithOrientation(99))).resolves.toBe(DEFAULT_ORIENTATION);
		await expect(readExifOrientation(jpegWithOrientation(0))).resolves.toBe(DEFAULT_ORIENTATION);
	});

	it('does not hang on a truncated EXIF header', async () => {
		const truncated = new Blob([
			new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]),
		]);
		await expect(readExifOrientation(truncated)).resolves.toBe(DEFAULT_ORIENTATION);
	});

	it('ignores a TIFF header with the wrong byte-order marker', async () => {
		const bytes = [
			0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16,
			0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
			0x58, 0x58, // neither "II" nor "MM"
			0x2a, 0x00,
			0x08, 0x00, 0x00, 0x00,
		];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('ignores a TIFF header with the wrong magic number', async () => {
		const bytes = [
			0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16,
			0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
			0x49, 0x49,
			0x99, 0x99, // should be 0x002a
			0x08, 0x00, 0x00, 0x00,
		];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('ignores an IFD offset that points past the buffer', async () => {
		const bytes = [
			0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16,
			0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
			0x49, 0x49,
			0x2a, 0x00,
			0xff, 0xff, 0x00, 0x00, // offset far beyond the data
		];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('returns the default when the IFD has no orientation tag', async () => {
		const bytes = [
			0xff, 0xd8, 0xff, 0xe1, 0x00, 0x20,
			0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
			0x49, 0x49,
			0x2a, 0x00,
			0x08, 0x00, 0x00, 0x00,
			0x01, 0x00, // one entry
			0x00, 0x01, // some other tag, not 0x0112
			0x03, 0x00,
			0x01, 0x00, 0x00, 0x00,
			0x06, 0x00, 0x00, 0x00,
			0x00, 0x00, 0x00, 0x00,
		];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('stops scanning a JPEG once it walks into entropy-coded data', async () => {
		// After SOI the next two bytes are not a 0xFFxx marker.
		const bytes = [0xff, 0xd8, 0x00, 0x00, 0x00, 0x00];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('stops on a JPEG segment claiming an impossible length', async () => {
		// APP0 marker with a declared length below the mandatory 2 bytes.
		const bytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x00, 0x00];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('skips a non-EXIF JPEG segment before reaching the scan', async () => {
		// APP0 segment (skipped) followed by start-of-scan, with no EXIF present.
		const bytes = [
			0xff, 0xd8,
			0xff, 0xe0, 0x00, 0x04, 0xaa, 0xbb, // APP0 with 2 payload bytes
			0xff, 0xda, 0x00, 0x02, // SOS
			0x00, 0x00,
		];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('skips a non-eXIf PNG chunk and stops at the pixel data', async () => {
		const bytes = [
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
			0x00, 0x00, 0x00, 0x0d, // IHDR length 13
			0x49, 0x48, 0x44, 0x52, // "IHDR"
			0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 13 data bytes
			0, 0, 0, 0, // CRC
			0x00, 0x00, 0x00, 0x00, // IDAT length 0
			0x49, 0x44, 0x41, 0x54, // "IDAT" → pixel data, stop scanning
		];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});

	it('ignores an IFD whose entries run past the buffer', async () => {
		const bytes = [
			0xff, 0xd8, 0xff, 0xe1, 0x00, 0x14, // SOI, APP1, length
			0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
			0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF: II, 0x002a, IFD at 8
			0x01, 0x00, // entryCount = 1
			0x12, 0x01, 0x03, 0x00, // entry truncated after 4 of its 12 bytes
		];
		await expect(readExifOrientation(new Blob([new Uint8Array(bytes)]))).resolves.toBe(
			DEFAULT_ORIENTATION,
		);
	});
});
