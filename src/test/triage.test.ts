import { describe, expect, it } from 'vitest';
import {
	EMITTED_LABELS,
	formatTriageComment,
	MIN_ACTIONABLE_BODY_LENGTH,
	triageIssue,
} from '../../.github/scripts/triage.mjs';

const detail = 'x'.repeat(MIN_ACTIONABLE_BODY_LENGTH + 10);

function issue(overrides: Record<string, unknown> = {}) {
	return {
		title: 'Something',
		body: detail,
		author: 'someone',
		labels: [] as string[],
		...overrides,
	};
}

describe('triageIssue categorisation', () => {
	it('detects bugs', () => {
		const result = triageIssue(issue({ title: 'Conversion crashes on large PNGs' }));
		expect(result.category).toBe('bug');
		expect(result.labels).toContain('bug');
	});

	it('detects feature requests', () => {
		const result = triageIssue(issue({ title: 'Please add support for HEIC images' }));
		expect(result.category).toBe('feature');
		expect(result.labels).toContain('enhancement');
	});

	it('detects documentation issues', () => {
		const result = triageIssue(issue({ title: 'Typo in the README' }));
		expect(result.category).toBe('documentation');
		expect(result.labels).toContain('documentation');
	});

	it('detects dependency issues', () => {
		const result = triageIssue(issue({ title: 'Bump pdf-lib to the latest version' }));
		expect(result.category).toBe('dependencies');
		expect(result.labels).toContain('dependencies');
	});

	it('detects licensing issues', () => {
		const result = triageIssue(
			issue({ title: 'Which license does this use?', body: `Is this MIT licensed? ${detail}` }),
		);
		expect(result.category).toBe('license');
		expect(result.labels).toContain('license');
	});

	it('detects security reports', () => {
		const result = triageIssue(issue({ title: 'Possible XSS in the filename field' }));
		expect(result.category).toBe('security');
		expect(result.labels).toContain('security');
	});

	it('detects accessibility issues', () => {
		const result = triageIssue(issue({ title: 'Buttons are missing ARIA labels' }));
		expect(result.category).toBe('accessibility');
		expect(result.labels).toContain('a11y');
	});

	it('detects performance issues', () => {
		const result = triageIssue(issue({ title: 'Conversion is very slow for 200 images' }));
		expect(result.category).toBe('performance');
		expect(result.labels).toContain('performance');
	});

	it('prioritises security over the generic bug rule', () => {
		const result = triageIssue(
			issue({ title: 'Security vulnerability causes an error', body: detail }),
		);
		expect(result.category).toBe('security');
	});

	it('prioritises licensing over the generic bug rule', () => {
		const result = triageIssue(issue({ title: 'License file is incorrect', body: detail }));
		expect(result.category).toBe('license');
	});

	it('falls back to unknown when nothing matches', () => {
		const result = triageIssue(issue({ title: 'Hello', body: 'Hello there everyone, greetings.' }));
		expect(result.category).toBe('unknown');
	});

	it('preserves labels applied by a template', () => {
		const result = triageIssue(issue({ title: 'Crash on export', labels: ['needs-triage'] }));
		expect(result.labels).toContain('needs-triage');
		expect(result.labels).toContain('bug');
	});
});

describe('triageIssue auto-fix eligibility', () => {
	it('accepts a detailed bug report', () => {
		const result = triageIssue(issue({ title: 'Rotation is broken', body: detail }));
		expect(result.autoFixEligible).toBe(true);
		expect(result.labels).toContain('triaged');
	});

	it('rejects security reports', () => {
		const result = triageIssue(issue({ title: 'XSS vulnerability', body: detail }));
		expect(result.autoFixEligible).toBe(false);
		expect(result.labels).toContain('needs-human');
	});

	it('rejects feature requests', () => {
		const result = triageIssue(issue({ title: 'Please add dark mode toggle', body: detail }));
		expect(result.autoFixEligible).toBe(false);
	});

	it('rejects questions', () => {
		const result = triageIssue(issue({ title: 'How do I convert a folder?', body: detail }));
		expect(result.autoFixEligible).toBe(false);
	});

	it('rejects issues with too little detail', () => {
		const result = triageIssue(issue({ title: 'It is broken', body: 'broken' }));
		expect(result.autoFixEligible).toBe(false);
		expect(result.reason).toMatch(/detail/i);
	});

	it('rejects uncategorised issues', () => {
		const result = triageIssue(issue({ title: 'Hello', body: 'Just saying hi to the maintainers.' }));
		expect(result.autoFixEligible).toBe(false);
	});

	it('rejects issues opened by bots', () => {
		const result = triageIssue(
			issue({ title: 'Bump vite', body: detail, author: 'dependabot[bot]' }),
		);
		expect(result.autoFixEligible).toBe(false);
		expect(result.reason).toMatch(/bot/i);
	});

	it('accepts documentation and licensing work', () => {
		expect(triageIssue(issue({ title: 'Typo in README', body: detail })).autoFixEligible).toBe(true);
		expect(
			triageIssue(issue({ title: 'Add SPDX license header', body: detail })).autoFixEligible,
		).toBe(true);
	});

	it('never applies both triaged and needs-human', () => {
		for (const title of ['Crash on export', 'XSS vulnerability', 'How do I use this?']) {
			const { labels } = triageIssue(issue({ title, body: detail }));
			expect(labels.includes('triaged') && labels.includes('needs-human')).toBe(false);
		}
	});

	it('returns sorted, deduplicated labels', () => {
		const { labels } = triageIssue(issue({ title: 'Crash', body: detail, labels: ['bug', 'bug'] }));
		expect(labels).toEqual([...new Set(labels)].sort());
	});
});

describe('EMITTED_LABELS', () => {
	// GitHub silently ignores labels that do not exist on the repository, so a
	// rule emitting an undeclared label would fail without any error.
	const titles = [
		'Conversion crashes on large PNGs',
		'Please add support for HEIC images',
		'Typo in the README',
		'Bump pdf-lib to the latest version',
		'Which license does this use?',
		'Possible XSS in the filename field',
		'Buttons are missing ARIA labels',
		'Conversion is very slow for 200 images',
		'How do I convert a folder?',
		'Hello there',
	];

	it('covers every label the rules can produce', () => {
		for (const title of titles) {
			for (const label of triageIssue(issue({ title, body: detail })).labels) {
				expect(EMITTED_LABELS, `"${title}" emitted an undeclared label`).toContain(label);
			}
		}
	});

	it('declares no label that is unreachable', () => {
		const produced = new Set<string>(['auto-fix-attempted']); // applied by the workflow, not the rules
		for (const title of titles) {
			for (const label of triageIssue(issue({ title, body: detail })).labels) {
				produced.add(label);
			}
		}
		for (const label of EMITTED_LABELS) {
			expect(produced, `"${label}" is declared but never emitted`).toContain(label);
		}
	});

	it('is sorted and free of duplicates, so it reads as a contract', () => {
		expect([...EMITTED_LABELS]).toEqual([...new Set(EMITTED_LABELS)].sort());
	});
});

describe('formatTriageComment', () => {
	it('includes the marker the workflow uses for idempotency', () => {
		const comment = formatTriageComment(triageIssue(issue({ title: 'Crash', body: detail })));
		expect(comment).toContain('### Automated triage');
	});

	it('promises Copilot only once assignment actually succeeded', () => {
		const result = triageIssue(issue({ title: 'Crash on export', body: detail }));
		expect(formatTriageComment(result, 'assigned')).toMatch(/Copilot has been assigned/);
		expect(formatTriageComment(result, 'unavailable')).not.toMatch(/has been assigned/);
	});

	it('explains when an eligible issue could not be handed off', () => {
		const result = triageIssue(issue({ title: 'Crash on export', body: detail }));
		const comment = formatTriageComment(result, 'unavailable');
		expect(comment).toMatch(/could not be/i);
		expect(comment).toMatch(/maintainer/i);
	});

	it('says nothing about Copilot for ineligible issues', () => {
		const result = triageIssue(issue({ title: 'XSS vulnerability', body: detail }));
		const comment = formatTriageComment(result, 'skipped');
		expect(comment).not.toMatch(/Copilot/);
		expect(comment).toMatch(/not attempted/);
		expect(comment).toMatch(/maintainer/i);
	});

	it('defaults to the skipped wording', () => {
		const result = triageIssue(issue({ title: 'XSS vulnerability', body: detail }));
		expect(formatTriageComment(result)).toBe(formatTriageComment(result, 'skipped'));
	});

	it('lists the category and labels', () => {
		const comment = formatTriageComment(triageIssue(issue({ title: 'Typo in docs', body: detail })));
		expect(comment).toContain('documentation');
		expect(comment).toContain('`triaged`');
	});
});
