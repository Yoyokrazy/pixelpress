/**
 * Minimal EXIF orientation reader.
 *
 * Browsers apply EXIF orientation when decoding an image, so `createImageBitmap`
 * and `<img>` report already-rotated dimensions. pdf-lib, in contrast, reads the
 * raw JPEG SOF / PNG IHDR header and ignores EXIF. Embedding the original bytes
 * for such a file would therefore place a landscape bitmap into a portrait box.
 * Detecting a non-default orientation lets the encoder fall back to a canvas
 * re-encode, which bakes the rotation into the pixels.
 */

/** Orientation 1 means "no transform"; it is also the fallback when absent. */
export const DEFAULT_ORIENTATION = 1;

const JPEG_SOI = 0xffd8;
const EXIF_TAG_ORIENTATION = 0x0112;

export async function readExifOrientation(file: Blob): Promise<number> {
	// Orientation lives in IFD0, which sits near the start of the file.
	const header = await file.slice(0, 128 * 1024).arrayBuffer();
	const view = new DataView(header);

	try {
		if (view.byteLength >= 2 && view.getUint16(0) === JPEG_SOI) {
			return readJpegOrientation(view);
		}
		if (isPng(view)) {
			return readPngOrientation(view);
		}
	} catch {
		// A truncated or malformed header simply means "assume no rotation".
	}
	return DEFAULT_ORIENTATION;
}

function isPng(view: DataView): boolean {
	return (
		view.byteLength >= 8 &&
		view.getUint32(0) === 0x89504e47 &&
		view.getUint32(4) === 0x0d0a1a0a
	);
}

/** Walk JPEG segments looking for the APP1 "Exif\0\0" block. */
function readJpegOrientation(view: DataView): number {
	let offset = 2;
	while (offset + 4 <= view.byteLength) {
		const marker = view.getUint16(offset);
		// Every segment marker starts with 0xFF; anything else means we have
		// walked into entropy-coded data and there is no EXIF to find.
		if ((marker & 0xff00) !== 0xff00) {
			break;
		}
		const length = view.getUint16(offset + 2);
		if (length < 2) {
			break;
		}
		if (marker === 0xffe1) {
			const exifStart = offset + 4;
			if (
				exifStart + 6 <= view.byteLength &&
				view.getUint32(exifStart) === 0x45786966 &&
				view.getUint16(exifStart + 4) === 0x0000
			) {
				return readTiffOrientation(view, exifStart + 6);
			}
		}
		// 0xFFDA is start-of-scan: image data follows, so stop scanning.
		if (marker === 0xffda) {
			break;
		}
		offset += 2 + length;
	}
	return DEFAULT_ORIENTATION;
}

/** Walk PNG chunks looking for an `eXIf` chunk. */
function readPngOrientation(view: DataView): number {
	let offset = 8;
	while (offset + 8 <= view.byteLength) {
		const length = view.getUint32(offset);
		const type = view.getUint32(offset + 4);
		if (type === 0x65584966) {
			return readTiffOrientation(view, offset + 8);
		}
		// 0x49444154 is IDAT: pixel data has started, so stop scanning.
		if (type === 0x49444154 || type === 0x49454e44) {
			break;
		}
		offset += 12 + length;
	}
	return DEFAULT_ORIENTATION;
}

/** Read tag 0x0112 out of IFD0 of a TIFF header. */
function readTiffOrientation(view: DataView, tiffStart: number): number {
	if (tiffStart + 8 > view.byteLength) {
		return DEFAULT_ORIENTATION;
	}

	const byteOrder = view.getUint16(tiffStart);
	const littleEndian = byteOrder === 0x4949;
	if (!littleEndian && byteOrder !== 0x4d4d) {
		return DEFAULT_ORIENTATION;
	}
	if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) {
		return DEFAULT_ORIENTATION;
	}

	const ifdOffset = view.getUint32(tiffStart + 4, littleEndian);
	const ifdStart = tiffStart + ifdOffset;
	if (ifdStart + 2 > view.byteLength) {
		return DEFAULT_ORIENTATION;
	}

	const entryCount = view.getUint16(ifdStart, littleEndian);
	for (let index = 0; index < entryCount; index += 1) {
		const entry = ifdStart + 2 + index * 12;
		if (entry + 12 > view.byteLength) {
			break;
		}
		if (view.getUint16(entry, littleEndian) === EXIF_TAG_ORIENTATION) {
			const value = view.getUint16(entry + 8, littleEndian);
			return value >= 1 && value <= 8 ? value : DEFAULT_ORIENTATION;
		}
	}
	return DEFAULT_ORIENTATION;
}
