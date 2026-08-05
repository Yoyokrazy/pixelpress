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

export declare function triageIssue(issue: IssueInput): TriageResult;

export declare function formatTriageComment(result: TriageResult): string;
