/**
 * Issue triage rules.
 *
 * Kept as a standalone module rather than inline workflow YAML so the
 * classification behaviour can be unit tested without invoking GitHub.
 * See `src/test/triage.test.ts`.
 */

/**
 * @typedef {'bug'|'feature'|'documentation'|'dependencies'|'license'|'security'|'performance'|'accessibility'|'question'|'unknown'} Category
 *
 * @typedef {object} IssueInput
 * @property {string} title
 * @property {string} body
 * @property {string} author        Login of the account that opened the issue.
 * @property {string[]} [labels]    Labels already present, e.g. from a template.
 *
 * @typedef {object} TriageResult
 * @property {string[]} labels
 * @property {Category} category
 * @property {boolean} autoFixEligible
 * @property {string} reason
 */

const BOT_AUTHORS = new Set(['dependabot[bot]', 'github-actions[bot]', 'renovate[bot]']);

// Order matters: the first matching rule wins, so narrow categories such as
// security and licensing are checked before the broad bug/feature rules.
const RULES = [
	{
		category: 'security',
		labels: ['security'],
		patterns: [
			/\bsecurity\b/i,
			/\bvulnerabilit(?:y|ies)\b/i,
			/\bCVE-\d{4}-\d+\b/i,
			/\bXSS\b/i,
			/\bCSRF\b/i,
			/\bexploit(?:able)?\b/i,
		],
	},
	{
		category: 'license',
		labels: ['license'],
		patterns: [
			/\blicen[cs]e[sd]?\b/i,
			/\blicensing\b/i,
			/\bcopyright\b/i,
			/\b(?:MIT|Apache|GPL|AGPL|LGPL|BSD|MPL)\b/,
			/\battribution\b/i,
			/\bSPDX\b/i,
		],
	},
	{
		category: 'dependencies',
		labels: ['dependencies'],
		patterns: [
			/\bdependabot\b/i,
			/\bdependenc(?:y|ies)\b/i,
			/\bupgrade\s+(?:to\s+)?v?\d/i,
			/\bbump\b/i,
			/\bnpm audit\b/i,
			/\boutdated\s+package/i,
		],
	},
	{
		category: 'accessibility',
		labels: ['a11y'],
		patterns: [
			/\baccessib(?:le|ility)\b/i,
			/\ba11y\b/i,
			/\bscreen ?reader\b/i,
			/\bARIA\b/,
			/\bkeyboard nav/i,
			/\bcontrast ratio\b/i,
			/\bWCAG\b/i,
		],
	},
	{
		category: 'performance',
		labels: ['performance'],
		patterns: [
			/\bperformance\b/i,
			/\bslow(?:ly|ness)?\b/i,
			/\bmemory leak\b/i,
			/\bout of memory\b/i,
			/\bhangs?\b/i,
			/\bfreezes?\b/i,
		],
	},
	{
		category: 'documentation',
		labels: ['documentation'],
		patterns: [
			/\bdocumentation\b/i,
			/\bdocs?\b/i,
			/\breadme\b/i,
			/\btypo\b/i,
			/\bspelling\b/i,
			/\bwording\b/i,
		],
	},
	{
		category: 'bug',
		labels: ['bug'],
		patterns: [
			/\bbug\b/i,
			/\bbroken\b/i,
			/\bcrash(?:es|ed|ing)?\b/i,
			/\berror\b/i,
			/\bexception\b/i,
			/\bfail(?:s|ed|ing|ure)?\b/i,
			/\bdoes ?n[o']?t work\b/i,
			/\bunexpected\b/i,
			/\bincorrect\b/i,
			/\bregression\b/i,
			/\bstack ?trace\b/i,
		],
	},
	{
		category: 'feature',
		labels: ['enhancement'],
		patterns: [
			/\bfeature request\b/i,
			/\bwould be (?:nice|great|good)\b/i,
			/\bplease add\b/i,
			/\bsupport for\b/i,
			/\benhancement\b/i,
			/\bproposal\b/i,
			/\bcan (?:you|we) add\b/i,
		],
	},
	{
		category: 'question',
		labels: ['question'],
		patterns: [/\bhow (?:do|can|would) i\b/i, /\bis it possible\b/i, /\bquestion\b/i],
	},
];

/** Categories a coding agent can usually make a sensible attempt at. */
const AUTO_FIX_CATEGORIES = new Set([
	'bug',
	'documentation',
	'dependencies',
	'license',
	'accessibility',
	'performance',
]);

/**
 * Every label this module can emit. The triage workflow applies these directly,
 * and GitHub silently ignores labels that do not exist, so a label added here
 * must also be created on the repository. `src/test/triage.test.ts` asserts
 * that no rule emits a label outside this set.
 */
export const EMITTED_LABELS = Object.freeze([
	'a11y',
	'auto-fix-attempted',
	'bug',
	'dependencies',
	'documentation',
	'enhancement',
	'license',
	'needs-human',
	'performance',
	'question',
	'security',
	'triaged',
]);

/** Minimum body length before an issue is considered actionable. */
export const MIN_ACTIONABLE_BODY_LENGTH = 30;

/**
 * @param {IssueInput} issue
 * @returns {TriageResult}
 */
export function triageIssue(issue) {
	const haystack = `${issue.title ?? ''}\n${issue.body ?? ''}`;
	const labels = new Set(issue.labels ?? []);
	let category = 'unknown';

	for (const rule of RULES) {
		if (rule.patterns.some((pattern) => pattern.test(haystack))) {
			category = rule.category;
			for (const label of rule.labels) {
				labels.add(label);
			}
			break;
		}
	}

	const { eligible, reason } = assessAutoFix(issue, category);
	labels.add(eligible ? 'triaged' : 'needs-human');

	return { labels: [...labels].sort(), category, autoFixEligible: eligible, reason };
}

/**
 * @param {IssueInput} issue
 * @param {Category} category
 */
function assessAutoFix(issue, category) {
	if (BOT_AUTHORS.has(issue.author)) {
		return { eligible: false, reason: 'Opened by a bot; handled by its own workflow.' };
	}
	if (category === 'security') {
		return {
			eligible: false,
			reason: 'Security reports are routed to a maintainer rather than automated.',
		};
	}
	if (category === 'question') {
		return { eligible: false, reason: 'Looks like a question rather than a code change.' };
	}
	if (category === 'unknown') {
		return { eligible: false, reason: 'Could not confidently categorise the issue.' };
	}
	if (category === 'feature') {
		return {
			eligible: false,
			reason: 'Feature requests need a design decision before any code is written.',
		};
	}
	if ((issue.body ?? '').trim().length < MIN_ACTIONABLE_BODY_LENGTH) {
		return { eligible: false, reason: 'Not enough detail to act on.' };
	}
	if (!AUTO_FIX_CATEGORIES.has(category)) {
		return { eligible: false, reason: `No automated handling for "${category}" issues.` };
	}
	return {
		eligible: true,
		reason: `Categorised as ${category} with enough detail to attempt a fix.`,
	};
}

/**
 * Human-readable summary posted as a comment on the issue.
 *
 * @param {TriageResult} result
 * @param {'assigned'|'unavailable'|'skipped'} [assignment]
 *   Outcome of the Copilot hand-off. `unavailable` means the workflow wanted to
 *   delegate but could not (for example no user token is configured).
 * @returns {string}
 */
export function formatTriageComment(result, assignment = 'skipped') {
	const lines = [
		'### Automated triage',
		'',
		`- **Category:** ${result.category}`,
		`- **Labels:** ${result.labels.map((label) => `\`${label}\``).join(', ')}`,
	];

	if (assignment === 'assigned') {
		lines.push(
			'- **Automated fix:** requested — ' + result.reason,
			'',
			'GitHub Copilot has been assigned and will open a linked pull request if it finds a fix.',
			'Any such pull request still needs human review before merging.',
		);
	} else if (assignment === 'unavailable') {
		lines.push(
			'- **Automated fix:** eligible, but could not be requested — ' + result.reason,
			'',
			'This issue qualified for an automated fix attempt, but the Copilot coding agent could not be assigned.',
			'A maintainer will pick it up instead.',
		);
	} else {
		lines.push(
			'- **Automated fix:** not attempted — ' + result.reason,
			'',
			'A maintainer will take a look. Thanks for the report!',
		);
	}

	return lines.join('\n');
}
