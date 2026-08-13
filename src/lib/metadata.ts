/**
 * Lossless image metadata removal.
 *
 * These helpers strip privacy-sensitive metadata (EXIF, GPS, XMP, IPTC,
 * comments, timestamps) from JPEG and PNG files **without touching the pixel
 * data** — whole marker segments / ancillary chunks are dropped and the rest of
 * the file is copied through byte-for-byte. Nothing is re-encoded, so there is
 * no quality loss. Anything that is not a JPEG or PNG we recognise, or that
 * looks malformed, is returned unchanged so the caller can never end up with a
 * corrupt image.
 */

/** JPEG APPn/COM markers whose payload is metadata rather than pixel data. */
const JPEG_STRIP_MARKERS = new Set<number>([
	0xffe1, // APP1 — EXIF and XMP
	0xffed, // APP13 — Photoshop / IPTC
	0xfffe, // COM — free-text comment
]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** PNG ancillary chunk types that carry metadata and are safe to remove. */
const PNG_STRIP_CHUNKS = new Set<string>(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function isJpeg(bytes: Uint8Array): boolean {
	return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isPng(bytes: Uint8Array): boolean {
	if (bytes.length < 8) {
		return false;
	}
	return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

/**
 * Remove EXIF/XMP/IPTC/comment segments from a JPEG. Structural markers, the
 * JFIF header, any ICC profile and the entropy-coded scan are preserved.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
	if (!isJpeg(bytes)) {
		return bytes;
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const kept: Array<[number, number]> = [];
	let offset = 2; // Skip the SOI marker.
	let removedAny = false;

	while (offset + 1 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			// Not sitting on a marker — treat the rest as opaque and stop parsing.
			break;
		}
		const marker = view.getUint16(offset);

		// Start of scan: the compressed image data runs to the end of the file.
		if (marker === 0xffda) {
			break;
		}
		// Markers without a length payload (should not appear here, but be safe).
		if (marker === 0xff01 || (marker >= 0xffd0 && marker <= 0xffd9)) {
			offset += 2;
			continue;
		}
		if (offset + 4 > bytes.length) {
			break;
		}
		const length = view.getUint16(offset + 2);
		if (length < 2 || offset + 2 + length > bytes.length) {
			// Malformed segment — bail out and keep the original file intact.
			return bytes;
		}
		const segmentEnd = offset + 2 + length;
		if (JPEG_STRIP_MARKERS.has(marker)) {
			removedAny = true;
		} else {
			kept.push([offset, segmentEnd]);
		}
		offset = segmentEnd;
	}

	if (!removedAny) {
		return bytes;
	}

	// Reassemble: SOI + retained segments + everything from here to EOF (the
	// scan data, or whatever the loop stopped on).
	let size = 2 + (bytes.length - offset);
	for (const [start, end] of kept) {
		size += end - start;
	}
	const out = new Uint8Array(size);
	out[0] = 0xff;
	out[1] = 0xd8;
	let cursor = 2;
	for (const [start, end] of kept) {
		out.set(bytes.subarray(start, end), cursor);
		cursor += end - start;
	}
	out.set(bytes.subarray(offset), cursor);
	return out;
}

/**
 * Remove metadata chunks (eXIf, textual and timestamp) from a PNG. Critical
 * chunks and colour/rendering ancillary chunks (gAMA, sRGB, iCCP, …) are kept.
 * Chunks are copied whole, so their CRCs stay valid.
 */
export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
	if (!isPng(bytes)) {
		return bytes;
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const kept: Array<[number, number]> = [];
	let offset = 8; // Skip the signature.
	let removedAny = false;
	const decoder = new TextDecoder('latin1');

	while (offset + 8 <= bytes.length) {
		const length = view.getUint32(offset);
		const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
		const chunkEnd = offset + 12 + length; // length + type + data + CRC.
		if (chunkEnd > bytes.length) {
			// Truncated chunk — leave the file untouched.
			return bytes;
		}
		if (PNG_STRIP_CHUNKS.has(type)) {
			removedAny = true;
		} else {
			kept.push([offset, chunkEnd]);
		}
		offset = chunkEnd;
		if (type === 'IEND') {
			break;
		}
	}

	if (!removedAny) {
		return bytes;
	}

	let size = 8;
	for (const [start, end] of kept) {
		size += end - start;
	}
	const out = new Uint8Array(size);
	out.set(PNG_SIGNATURE, 0);
	let cursor = 8;
	for (const [start, end] of kept) {
		out.set(bytes.subarray(start, end), cursor);
		cursor += end - start;
	}
	return out;
}

/**
 * Losslessly strip metadata from a PNG or JPEG. The format is detected from the
 * file's magic bytes (which are authoritative — a mislabelled extension cannot
 * fool it), and unsupported or malformed input is returned unchanged.
 */
export function stripImageMetadata(bytes: Uint8Array): Uint8Array {
	if (isJpeg(bytes)) {
		return stripJpegMetadata(bytes);
	}
	if (isPng(bytes)) {
		return stripPngMetadata(bytes);
	}
	return bytes;
}
