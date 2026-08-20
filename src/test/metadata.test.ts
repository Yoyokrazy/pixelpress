import { describe, expect, it } from 'vitest';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { stripImageMetadata, stripJpegMetadata, stripPngMetadata } from '../lib/metadata';

// --- JPEG fixtures -------------------------------------------------------

function u16(value: number): number[] {
	return [(value >> 8) & 0xff, value & 0xff];
}

/** Build a JPEG APPn/COM segment: FF, marker, length, payload. */
function segment(marker: number, payload: number[]): number[] {
	return [0xff, marker, ...u16(payload.length + 2), ...payload];
}

/** Assemble a structurally-walkable JPEG from header segments. */
function buildJpeg(segments: number[][]): Uint8Array {
	const bytes = [0xff, 0xd8]; // SOI
	for (const seg of segments) {
		bytes.push(...seg);
	}
	// Minimal SOS header, some fake scan bytes, then EOI.
	bytes.push(0xff, 0xda, ...u16(8), 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00);
	bytes.push(0x11, 0x22, 0x33);
	bytes.push(0xff, 0xd9); // EOI
	return new Uint8Array(bytes);
}

/** True if the byte stream contains the given two-byte marker (FF Ex). */
function hasMarker(bytes: Uint8Array, marker: number): boolean {
	for (let i = 0; i + 1 < bytes.length; i += 1) {
		if (bytes[i] === 0xff && bytes[i + 1] === marker) {
			return true;
		}
	}
	return false;
}

const APP0_JFIF = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00]);
const APP1_EXIF = segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00]);
const APP2_ICC = segment(0xe2, [0x49, 0x43, 0x43, 0x5f, 0x50, 0x52, 0x4f, 0x46, 0x49, 0x4c, 0x45]);
const APP13_IPTC = segment(0xed, [0x50, 0x68, 0x6f, 0x74, 0x6f, 0x73, 0x68, 0x6f, 0x70]);
const COM = segment(0xfe, [0x73, 0x65, 0x63, 0x72, 0x65, 0x74]);

/** A tiny valid 8×8 baseline JPEG (no metadata) for re-embed validity checks. */
const JPEG_8X8_BASE64 =
	'/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/wAALCAAIAAgBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ANCv/9k=';

function decodeBase64(base64: string): Uint8Array {
	return Uint8Array.from(Buffer.from(base64, 'base64'));
}

// --- PNG fixtures --------------------------------------------------------

let crcTable: number[] | undefined;
function crc32(buffer: Uint8Array): number {
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
		crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): number[] {
	const length = [(data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff];
	const typeBytes = [...type].map((character) => character.charCodeAt(0));
	const body = Uint8Array.from([...typeBytes, ...data]);
	const crc = crc32(body);
	return [...length, ...body, (crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff];
}

/** Build an 8×8 truecolour PNG, optionally injecting metadata chunks after IHDR. */
function buildPng(extraChunks: Array<[string, Uint8Array]> = []): Uint8Array {
	const width = 8;
	const height = 8;
	const ihdr = new Uint8Array(13);
	const dv = new DataView(ihdr.buffer);
	dv.setUint32(0, width);
	dv.setUint32(4, height);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 2; // truecolour

	const raw = new Uint8Array((width * 3 + 1) * height);
	const idat = deflateSync(raw);

	const bytes: number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	bytes.push(...pngChunk('IHDR', ihdr));
	for (const [type, data] of extraChunks) {
		bytes.push(...pngChunk(type, data));
	}
	bytes.push(...pngChunk('IDAT', new Uint8Array(idat)));
	bytes.push(...pngChunk('IEND', new Uint8Array(0)));
	return Uint8Array.from(bytes);
}

function pngHasChunk(bytes: Uint8Array, type: string): boolean {
	const needle = [...type].map((character) => character.charCodeAt(0));
	for (let i = 8; i + 8 <= bytes.length; i += 1) {
		if (needle.every((value, index) => bytes[i + 4 + index] === value)) {
			return true;
		}
	}
	return false;
}

// --- Tests ---------------------------------------------------------------

describe('stripJpegMetadata', () => {
	it('removes EXIF, IPTC and comment segments', () => {
		const jpeg = buildJpeg([APP0_JFIF, APP1_EXIF, APP13_IPTC, COM]);
		const stripped = stripJpegMetadata(jpeg);
		expect(hasMarker(stripped, 0xe1)).toBe(false); // APP1 gone
		expect(hasMarker(stripped, 0xed)).toBe(false); // APP13 gone
		expect(hasMarker(stripped, 0xfe)).toBe(false); // COM gone
	});

	it('keeps the JFIF header, ICC profile and the scan', () => {
		const jpeg = buildJpeg([APP0_JFIF, APP1_EXIF, APP2_ICC]);
		const stripped = stripJpegMetadata(jpeg);
		expect(hasMarker(stripped, 0xe0)).toBe(true); // APP0 JFIF kept
		expect(hasMarker(stripped, 0xe2)).toBe(true); // APP2 ICC kept
		expect(hasMarker(stripped, 0xda)).toBe(true); // SOS kept
		expect(stripped[0]).toBe(0xff);
		expect(stripped[1]).toBe(0xd8); // SOI kept
		expect(stripped.at(-2)).toBe(0xff);
		expect(stripped.at(-1)).toBe(0xd9); // EOI kept
	});

	it('shrinks the file by exactly the removed segments', () => {
		const jpeg = buildJpeg([APP0_JFIF, APP1_EXIF]);
		const stripped = stripJpegMetadata(jpeg);
		expect(stripped.length).toBe(jpeg.length - APP1_EXIF.length);
	});

	it('returns the same instance when there is nothing to strip', () => {
		const jpeg = buildJpeg([APP0_JFIF, APP2_ICC]);
		expect(stripJpegMetadata(jpeg)).toBe(jpeg);
	});

	it('is idempotent', () => {
		const jpeg = buildJpeg([APP0_JFIF, APP1_EXIF, COM]);
		const once = stripJpegMetadata(jpeg);
		const twice = stripJpegMetadata(once);
		expect(twice).toBe(once); // second pass finds nothing to remove
	});

	it('leaves non-JPEG input untouched', () => {
		const notJpeg = new Uint8Array([1, 2, 3, 4]);
		expect(stripJpegMetadata(notJpeg)).toBe(notJpeg);
	});

	it('produces a JPEG pdf-lib can still embed', async () => {
		const base = decodeBase64(JPEG_8X8_BASE64);
		// Inject an APP1 EXIF block right after SOI.
		const withExif = Uint8Array.from([
			base[0]!,
			base[1]!,
			...APP1_EXIF,
			...base.subarray(2),
		]);
		const stripped = stripJpegMetadata(withExif);
		expect(hasMarker(stripped, 0xe1)).toBe(false);
		expect(stripped.length).toBeLessThan(withExif.length);

		const pdf = await PDFDocument.create();
		const image = await pdf.embedJpg(stripped);
		expect(image.width).toBe(8);
		expect(image.height).toBe(8);
	});
});

describe('stripPngMetadata', () => {
	it('removes text, exif and time chunks', () => {
		const png = buildPng([
			['tEXt', Uint8Array.from([...'Comment\0hi'].map((c) => c.charCodeAt(0)))],
			['eXIf', Uint8Array.from([0x49, 0x49, 0x2a, 0x00])],
			['tIME', Uint8Array.from([0x07, 0xe8, 1, 1, 0, 0, 0])],
		]);
		const stripped = stripPngMetadata(png);
		expect(pngHasChunk(stripped, 'tEXt')).toBe(false);
		expect(pngHasChunk(stripped, 'eXIf')).toBe(false);
		expect(pngHasChunk(stripped, 'tIME')).toBe(false);
	});

	it('keeps the critical chunks', () => {
		const png = buildPng([['tEXt', Uint8Array.from([0x61, 0x00, 0x62])]]);
		const stripped = stripPngMetadata(png);
		expect(pngHasChunk(stripped, 'IHDR')).toBe(true);
		expect(pngHasChunk(stripped, 'IDAT')).toBe(true);
		expect(pngHasChunk(stripped, 'IEND')).toBe(true);
	});

	it('preserves the 8-byte signature', () => {
		const png = buildPng([['tEXt', Uint8Array.from([0x61, 0x00, 0x62])]]);
		const stripped = stripPngMetadata(png);
		expect([...stripped.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	});

	it('returns the same instance when there is nothing to strip', () => {
		const png = buildPng();
		expect(stripPngMetadata(png)).toBe(png);
	});

	it('leaves non-PNG input untouched', () => {
		const notPng = new Uint8Array([0x89, 0x50, 0x00]);
		expect(stripPngMetadata(notPng)).toBe(notPng);
	});

	it('produces a PNG pdf-lib can still embed', async () => {
		const png = buildPng([['tEXt', Uint8Array.from([...'Author\0Ada'].map((c) => c.charCodeAt(0)))]]);
		const stripped = stripPngMetadata(png);
		expect(pngHasChunk(stripped, 'tEXt')).toBe(false);

		const pdf = await PDFDocument.create();
		const image = await pdf.embedPng(stripped);
		expect(image.width).toBe(8);
		expect(image.height).toBe(8);
	});
});

describe('stripJpegMetadata — defensive branches', () => {
	it('handles a standalone restart marker (no length payload) before a strippable segment', () => {
		// RST0 (0xFFD0) is a marker with no length field; the parser should step
		// over it by 2 bytes and continue stripping later segments.
		const bytes = [
			0xff, 0xd8, // SOI
			0xff, 0xd0, // RST0 — no payload
			...APP1_EXIF, // should still be stripped
			0xff, 0xda, ...u16(8), 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, // SOS
			0x11, 0x22, 0xff, 0xd9, // scan data + EOI
		];
		const jpeg = new Uint8Array(bytes);
		const stripped = stripJpegMetadata(jpeg);
		expect(hasMarker(stripped, 0xe1)).toBe(false);
	});

	it('returns the original when a segment length field is truncated (offset+4 > length)', () => {
		// A JPEG that ends immediately after the marker bytes — no room for the
		// 2-byte length field — must be returned untouched to avoid an out-of-bounds read.
		const bytes = [
			0xff, 0xd8, // SOI
			0xff, 0xe1, // APP1 marker, but the file ends here (no length bytes)
		];
		const jpeg = new Uint8Array(bytes);
		expect(stripJpegMetadata(jpeg)).toBe(jpeg);
	});

	it('returns the original when a segment declares a length that exceeds the file', () => {
		// length field says 0x00FF (255) but only 2 bytes follow — malformed.
		const bytes = [
			0xff, 0xd8, // SOI
			0xff, 0xe1, // APP1 marker
			0x00, 0xff, // length = 255, but only 2 bytes follow
			0x00, 0x00, // padding (far short of 255)
		];
		const jpeg = new Uint8Array(bytes);
		expect(stripJpegMetadata(jpeg)).toBe(jpeg);
	});

	it('stops cleanly when a non-0xFF byte is encountered mid-stream', () => {
		// A valid non-strippable header followed by garbage — must not crash.
		const bytes = [
			0xff, 0xd8, // SOI
			...APP0_JFIF, // valid, kept
			0x00, 0x00, // not a marker — parser should stop and keep everything
			0xff, 0xd9, // EOI (won't be visited by the marker loop)
		];
		const jpeg = new Uint8Array(bytes);
		// No metadata markers present, so the same instance is returned.
		expect(stripJpegMetadata(jpeg)).toBe(jpeg);
	});
});

describe('stripPngMetadata — defensive branches', () => {
	it('returns the original when a chunk claims a length past the end of the file', () => {
		// Build a PNG where the tEXt chunk length field is larger than the data.
		const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		// Write a tEXt chunk with length=9999 but no actual data.
		const truncated = new Uint8Array([
			...sig,
			...pngChunk('IHDR', new Uint8Array(13)),
			0x00, 0x00, 0x27, 0x0f, // length = 9999
			0x74, 0x45, 0x58, 0x74, // type = "tEXt"
			// chunk data is missing
		]);
		expect(stripPngMetadata(truncated)).toBe(truncated);
	});
});

describe('stripImageMetadata', () => {
	it('dispatches on the magic bytes', () => {
		const jpeg = buildJpeg([APP1_EXIF]);
		const png = buildPng([['tEXt', Uint8Array.from([0x61, 0x00, 0x62])]]);
		expect(hasMarker(stripImageMetadata(jpeg), 0xe1)).toBe(false);
		expect(pngHasChunk(stripImageMetadata(png), 'tEXt')).toBe(false);
	});

	it('detects the format even when a caller would mislabel it', () => {
		// A PNG is stripped as a PNG regardless of any external type hint,
		// because detection is by signature.
		const png = buildPng([['tEXt', Uint8Array.from([0x61, 0x00, 0x62])]]);
		expect(pngHasChunk(stripImageMetadata(png), 'tEXt')).toBe(false);
	});

	it('returns unsupported formats unchanged', () => {
		const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
		expect(stripImageMetadata(webp)).toBe(webp);
	});
});
