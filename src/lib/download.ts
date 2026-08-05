import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { dedupeFileName, sanitizeFileName } from './format';

export function downloadBlob(blob: Blob, fileName: string): void {
	saveAs(blob, sanitizeFileName(fileName));
}

export interface ZipEntry {
	fileName: string;
	blob: Blob;
}

/** Bundle blobs into a single zip archive and trigger a download. */
export async function downloadAsZip(
	entries: readonly ZipEntry[],
	zipName: string,
	onProgress?: (percent: number) => void,
): Promise<Blob> {
	if (entries.length === 0) {
		throw new Error('Nothing to download');
	}

	const zip = new JSZip();
	const taken = new Set<string>();
	for (const entry of entries) {
		zip.file(dedupeFileName(sanitizeFileName(entry.fileName), taken), entry.blob);
	}

	const blob = await zip.generateAsync(
		{ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
		(metadata) => onProgress?.(metadata.percent),
	);

	saveAs(blob, sanitizeFileName(zipName.endsWith('.zip') ? zipName : `${zipName}.zip`));
	return blob;
}
