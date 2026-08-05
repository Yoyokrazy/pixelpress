/**
 * Parse a human page-range expression into a sorted list of 1-based page
 * numbers. Supports comma/space separated singles ("3"), closed ranges
 * ("2-5"), open-ended tails ("7-"), open-ended heads ("-4") and the keywords
 * `all`, `odd`, `even`, `first`, `last`.
 *
 * An empty or whitespace-only expression selects every page. Invalid tokens
 * are reported through `errors` rather than throwing so the UI can surface
 * them while still using the pages that did parse.
 */
export interface PageRangeResult {
	pages: number[];
	errors: string[];
}

export function parsePageRange(expression: string, pageCount: number): PageRangeResult {
	const errors: string[] = [];

	if (pageCount <= 0) {
		return { pages: [], errors };
	}

	const trimmed = expression.trim();
	if (trimmed === '') {
		return { pages: allPages(pageCount), errors };
	}

	const selected = new Set<number>();
	const tokens = trimmed.split(/[,\s]+/).filter((token) => token.length > 0);

	for (const token of tokens) {
		const lower = token.toLowerCase();

		if (lower === 'all' || lower === '*') {
			for (const page of allPages(pageCount)) {
				selected.add(page);
			}
			continue;
		}
		if (lower === 'odd') {
			for (let page = 1; page <= pageCount; page += 2) {
				selected.add(page);
			}
			continue;
		}
		if (lower === 'even') {
			for (let page = 2; page <= pageCount; page += 2) {
				selected.add(page);
			}
			continue;
		}
		if (lower === 'first') {
			selected.add(1);
			continue;
		}
		if (lower === 'last') {
			selected.add(pageCount);
			continue;
		}

		const rangeMatch = /^(\d*)\s*[-–—:]\s*(\d*)$/.exec(lower);
		if (rangeMatch) {
			const [, rawStart, rawEnd] = rangeMatch;
			if (rawStart === '' && rawEnd === '') {
				errors.push(`"${token}" is not a valid range`);
				continue;
			}
			const start = rawStart === '' ? 1 : Number.parseInt(rawStart, 10);
			const end = rawEnd === '' ? pageCount : Number.parseInt(rawEnd, 10);
			const from = Math.min(start, end);
			const to = Math.max(start, end);

			if (from < 1 || to > pageCount) {
				errors.push(`"${token}" is outside 1-${pageCount}`);
			}
			for (let page = Math.max(1, from); page <= Math.min(pageCount, to); page += 1) {
				selected.add(page);
			}
			continue;
		}

		if (/^\d+$/.test(lower)) {
			const page = Number.parseInt(lower, 10);
			if (page < 1 || page > pageCount) {
				errors.push(`Page ${page} is outside 1-${pageCount}`);
				continue;
			}
			selected.add(page);
			continue;
		}

		errors.push(`"${token}" is not a valid page or range`);
	}

	return { pages: [...selected].sort((a, b) => a - b), errors };
}

function allPages(pageCount: number): number[] {
	return Array.from({ length: pageCount }, (_, index) => index + 1);
}

/** Render a list of page numbers back into a compact expression like "1-3, 7". */
export function formatPageRange(pages: number[]): string {
	if (pages.length === 0) {
		return '';
	}
	const sorted = [...new Set(pages)].sort((a, b) => a - b);
	const parts: string[] = [];
	let start = sorted[0];
	let previous = sorted[0];

	for (let index = 1; index <= sorted.length; index += 1) {
		const current = sorted[index];
		if (current !== previous + 1) {
			parts.push(start === previous ? `${start}` : `${start}-${previous}`);
			start = current;
		}
		previous = current;
	}

	return parts.join(', ');
}
