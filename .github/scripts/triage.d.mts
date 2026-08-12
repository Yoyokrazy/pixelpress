export type Category =
	| 'bug'
	| 'feature'
	| 'documentation'
	| 'dependencies'
	| 'license'
	| 'security'
	| 'performance'
	| 'accessibility'
	| 'question'
	| 'unknown';

export interface IssueInput {
	title: string;
	body: string;
	/** Login of the account that opened the issue. */
	author: string;
	/** Labels already present, e.g. applied by an issue template. */
	labels?: string[];
}

export interface TriageResult {
	labels: string[];
	category: Category;
	/** True when the issue looks actionable enough to hand to a coding agent. */
	autoFixEligible: boolean;
	/** Why the issue was or was not considered eligible. */
	reason: string;
}

/** Minimum body length before an issue is considered actionable. */
export declare const MIN_ACTIONABLE_BODY_LENGTH: number;

/**
 * Every label the triage rules can emit. Anything listed here must also exist
 * on the repository, since GitHub silently ignores unknown labels.
 */
export declare const EMITTED_LABELS: readonly string[];

export declare function triageIssue(issue: IssueInput): TriageResult;

export interface AutoFixAssessment {
	/** True when the issue looks actionable enough to hand to a coding agent. */
	eligible: boolean;
	/** Why the issue was or was not considered eligible. */
	reason: string;
}

/**
 * Decide whether a categorised issue is eligible for an automated fix. Accepts
 * any category string so the defensive "no automated handling" guard can be
 * exercised for categories a future rule might introduce.
 */
export declare function assessAutoFix(issue: IssueInput, category: string): AutoFixAssessment;

/** Outcome of the Copilot hand-off attempt. */
export type AssignmentOutcome = 'assigned' | 'unavailable' | 'skipped';

export declare function formatTriageComment(
	result: TriageResult,
	assignment?: AssignmentOutcome,
): string;
