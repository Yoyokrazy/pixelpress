import { describe, expect, it } from 'vitest';
import {
	commonPrefix,
	dedupeFileName,
	expandFileNamePattern,
	formatBytes,
	formatDuration,
	parseHexColor,
	sanitizeFileName,
	stripExtension,
	withExtension,
} from '../lib/format';

describe('formatBytes', () => {
	it('formats each unit', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(1024)).toBe('1 KB');
		expect(formatBytes(1536)).toBe('1.5 KB');
		expect(formatBytes(1024 ** 2)).toBe('1 MB');
		expect(formatBytes(1024 ** 3)).toBe('1 GB');
	});

	it('treats negative and non-finite values as zero', () => {
		expect(formatBytes(-5)).toBe('0 B');
		expect(formatBytes(Number.NaN)).toBe('0 B');
	});
});

describe('stripExtension / withExtension', () => {
	it('removes only the final extension', () => {
		expect(stripExtension('photo.png')).toBe('photo');
		expect(stripExtension('archive.tar.gz')).toBe('archive.tar');
		expect(stripExtension('noextension')).toBe('noextension');
		expect(stripExtension('.hidden')).toBe('.hidden');
	});

	it('appends an extension only when missing', () => {
		expect(withExtension('report', '.pdf')).toBe('report.pdf');
		expect(withExtension('report.pdf', '.pdf')).toBe('report.pdf');
		expect(withExtension('report.PDF', 'pdf')).toBe('report.PDF');
	});
});

describe('sanitizeFileName', () => {
	it('removes characters that are illegal on common filesystems', () => {
		expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
	});

	it('collapses whitespace and trims dots', () => {
		expect(sanitizeFileName('  my   file  ')).toBe('my file');
		expect(sanitizeFileName('...name...')).toBe('name');
	});

	it('falls back when nothing usable remains', () => {
		expect(sanitizeFileName('///')).toBe('pixelpress');
		expect(sanitizeFileName('', 'fallback')).toBe('fallback');
	});

	it('caps very long names', () => {
		expect(sanitizeFileName('x'.repeat(500))).toHaveLength(180);
	});
});

describe('expandFileNamePattern', () => {
	const tokens = { name: 'scan', page: 7, pageCount: 120, index: 3, total: 12 };

	it('expands every supported token', () => {
		expect(expandFileNamePattern('{name}-{page}', tokens)).toBe('scan-007');
		expect(expandFileNamePattern('{index} of {total}', tokens)).toBe('03 of 12');
		expect(expandFileNamePattern('{name} ({pageCount})', tokens)).toBe('scan (120)');
	});

	it('honours explicit padding widths', () => {
		expect(expandFileNamePattern('{page:5}', tokens)).toBe('00007');
		expect(expandFileNamePattern('{page:1}', tokens)).toBe('7');
	});

	it('pads to at least two digits by default', () => {
		expect(expandFileNamePattern('{page}', { ...tokens, page: 2, pageCount: 9 })).toBe('02');
	});

	it('is case-insensitive for token names', () => {
		expect(expandFileNamePattern('{NAME}-{PAGE}', tokens)).toBe('scan-007');
	});

	it('leaves unknown text untouched and sanitizes the result', () => {
		expect(expandFileNamePattern('page/{page}', tokens)).toBe('page007');
	});

	it('falls back to a usable name when the pattern yields nothing', () => {
		expect(expandFileNamePattern('///', tokens)).toBe('scan-007');
	});
});

describe('dedupeFileName', () => {
	it('returns the original name when unused', () => {
		expect(dedupeFileName('a.png', new Set())).toBe('a.png');
	});

	it('adds an incrementing suffix before the extension', () => {
		const taken = new Set<string>();
		expect(dedupeFileName('a.png', taken)).toBe('a.png');
		expect(dedupeFileName('a.png', taken)).toBe('a (2).png');
		expect(dedupeFileName('a.png', taken)).toBe('a (3).png');
	});

	it('handles names without an extension', () => {
		const taken = new Set(['report']);
		expect(dedupeFileName('report', taken)).toBe('report (2)');
	});
});

describe('parseHexColor', () => {
	it('parses six and three digit hex', () => {
		expect(parseHexColor('#ffffff')).toEqual({ r: 1, g: 1, b: 1 });
		expect(parseHexColor('#000000')).toEqual({ r: 0, g: 0, b: 0 });
		expect(parseHexColor('#f00').r).toBe(1);
		expect(parseHexColor('#f00').g).toBe(0);
	});

	it('accepts values without a leading hash', () => {
		expect(parseHexColor('00ff00').g).toBe(1);
	});

	it('falls back to white for malformed input', () => {
		expect(parseHexColor('nope')).toEqual({ r: 1, g: 1, b: 1 });
	});
});

describe('commonPrefix', () => {
	it('finds the shared leading text', () => {
		expect(commonPrefix(['scan-001', 'scan-002', 'scan-003'])).toBe('scan');
	});

	it('trims trailing separators and partial sequence numbers', () => {
		expect(commonPrefix(['photo_01', 'photo_02'])).toBe('photo');
		expect(commonPrefix(['page 1', 'page 2'])).toBe('page');
	});

	it('keeps the prefix when trimming would empty it', () => {
		expect(commonPrefix(['2024a', '2024b'])).toBe('2024');
	});

	it('returns an empty string when nothing is shared', () => {
		expect(commonPrefix(['alpha', 'beta'])).toBe('');
		expect(commonPrefix([])).toBe('');
	});

	it('returns the whole name for a single entry', () => {
		expect(commonPrefix(['holiday'])).toBe('holiday');
		expect(commonPrefix(['scan-001'])).toBe('scan-001');
	});
});

describe('formatDuration', () => {
	it('reports sub-second durations in whole milliseconds', () => {
		expect(formatDuration(0)).toBe('0 ms');
		expect(formatDuration(4.6)).toBe('5 ms');
		expect(formatDuration(999)).toBe('999 ms');
	});

	it('reports durations under a minute in seconds to one decimal', () => {
		expect(formatDuration(1000)).toBe('1.0 s');
		expect(formatDuration(2500)).toBe('2.5 s');
		expect(formatDuration(59_400)).toBe('59.4 s');
	});

	it('reports a minute or more as whole minutes and seconds', () => {
		expect(formatDuration(60_000)).toBe('1m 0s');
		expect(formatDuration(90_000)).toBe('1m 30s');
		expect(formatDuration(3_661_000)).toBe('61m 1s');
	});
});
