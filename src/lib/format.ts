/** Formatting and filename helpers. */

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number, decimals = 1): string {
	if (!Number.isFinite(bytes) || bytes <= 0) {
		return '0 B';
	}
	const exponent = Math.min(
		Math.floor(Math.log(bytes) / Math.log(1024)),
		BYTE_UNITS.length - 1,
	);
	const value = bytes / 1024 ** exponent;
	const rounded = exponent === 0 ? Math.round(value) : Number(value.toFixed(decimals));
	return `${rounded} ${BYTE_UNITS[exponent]}`;
}

/** Strip the final extension from a filename. */
export function stripExtension(fileName: string): string {
	const dot = fileName.lastIndexOf('.');
	return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/** Remove characters that are unsafe in filenames across platforms. */
export function sanitizeFileName(name: string, fallback = 'pixelpress'): string {
	const cleaned = name
		// Control characters are deliberately matched: they are illegal in filenames.
		// oxlint-disable-next-line no-control-regex
		.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/^\.+/, '')
		.replace(/\.+$/, '');
	return cleaned === '' ? fallback : cleaned.slice(0, 180);
}

/** Ensure a filename ends with the given extension (case-insensitive check). */
export function withExtension(name: string, extension: string): string {
	const ext = extension.startsWith('.') ? extension : `.${extension}`;
	return name.toLowerCase().endsWith(ext.toLowerCase()) ? name : `${name}${ext}`;
}

export function padNumber(value: number, width: number): string {
	return String(value).padStart(width, '0');
}

export interface FileNameTokens {
	name: string;
	page: number;
	pageCount: number;
	index: number;
	total: number;
}

/**
 * Expand a filename pattern. Supported tokens: `{name}`, `{page}`, `{index}`,
 * `{total}`, `{pageCount}`, plus zero-padded `{page:3}` / `{index:3}` forms.
 */
export function expandFileNamePattern(pattern: string, tokens: FileNameTokens): string {
	const pageWidth = Math.max(2, String(tokens.pageCount).length);
	const indexWidth = Math.max(2, String(tokens.total).length);

	const expanded = pattern.replace(
		/\{(name|page|index|total|pageCount)(?::(\d+))?\}/gi,
		(_match, rawToken: string, rawWidth: string | undefined) => {
			const token = rawToken.toLowerCase();
			const width = rawWidth ? Number.parseInt(rawWidth, 10) : undefined;
			switch (token) {
				case 'name':
					return tokens.name;
				case 'page':
					return padNumber(tokens.page, width ?? pageWidth);
				case 'index':
					return padNumber(tokens.index, width ?? indexWidth);
				case 'total':
					return String(tokens.total);
				case 'pagecount':
					return String(tokens.pageCount);
				default:
					return '';
			}
		},
	);

	return sanitizeFileName(expanded, `${tokens.name}-${padNumber(tokens.page, pageWidth)}`);
}

/** Append a numeric suffix when a name is already taken. */
export function dedupeFileName(name: string, taken: Set<string>): string {
	if (!taken.has(name)) {
		taken.add(name);
		return name;
	}
	const dot = name.lastIndexOf('.');
	const base = dot > 0 ? name.slice(0, dot) : name;
	const extension = dot > 0 ? name.slice(dot) : '';
	let counter = 2;
	let candidate = `${base} (${counter})${extension}`;
	while (taken.has(candidate)) {
		counter += 1;
		candidate = `${base} (${counter})${extension}`;
	}
	taken.add(candidate);
	return candidate;
}

/** Parse `#rgb` / `#rrggbb` into normalised 0-1 channels. */
export function parseHexColor(hex: string): { r: number; g: number; b: number } {
	const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!match || match[1] === undefined) {
		return { r: 1, g: 1, b: 1 };
	}
	let value = match[1];
	if (value.length === 3) {
		value = value
			.split('')
			.map((character) => character + character)
			.join('');
	}
	return {
		r: Number.parseInt(value.slice(0, 2), 16) / 255,
		g: Number.parseInt(value.slice(2, 4), 16) / 255,
		b: Number.parseInt(value.slice(4, 6), 16) / 255,
	};
}

export function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${Math.round(ms)} ms`;
	}
	const seconds = ms / 1000;
	return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

/**
 * Longest shared filename prefix, used to name batch downloads sensibly.
 * Trailing separators and partial sequence numbers are trimmed so
 * `scan-001, scan-002` yields `scan` rather than `scan-00`.
 */
export function commonPrefix(names: readonly string[]): string {
	const first = names[0];
	if (first === undefined) {
		return '';
	}
	let prefix = first;
	for (const name of names.slice(1)) {
		let index = 0;
		while (index < prefix.length && index < name.length && prefix[index] === name[index]) {
			index += 1;
		}
		prefix = prefix.slice(0, index);
		if (prefix === '') {
			break;
		}
	}

	if (names.length === 1) {
		return prefix.trim();
	}

	const trimmed = prefix
		.replace(/[\s._-]+$/, '')
		.replace(/\d+$/, '')
		.replace(/[\s._-]+$/, '');
	return trimmed === '' ? prefix.trim() : trimmed;
}
