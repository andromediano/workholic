/**
 * Workflow statuses, declared in the order they should appear in the file
 * explorer. The index in this array doubles as the sort rank.
 */
export const STATUSES = [
	'BACKLOG',
	'READY',
	'IN_PROGRESS',
	'IN_REVIEW',
	'DONE',
] as const;

export type Status = (typeof STATUSES)[number];

/** Rank given to files with no status, or an unrecognized one. Always last. */
export const NO_STATUS_RANK = STATUSES.length;

const RANK_BY_STATUS = new Map<Status, number>(
	STATUSES.map((status, index) => [status, index]),
);

const STATUS_BY_KEY = new Map<string, Status>(
	STATUSES.map((status) => [status, status]),
);

export function rankOf(status: Status | null): number {
	if (status === null) return NO_STATUS_RANK;
	return RANK_BY_STATUS.get(status) ?? NO_STATUS_RANK;
}

/**
 * Accepts the loose spellings people actually write in frontmatter — `in
 * progress`, `In-Progress`, `in_progress` — and maps them onto a canonical
 * status. Returns null for anything unrecognized, which sorts to the bottom
 * and receives no indicator.
 */
export function normalizeStatus(raw: unknown): Status | null {
	if (typeof raw !== 'string') return null;

	const key = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
	if (key.length === 0) return null;

	return STATUS_BY_KEY.get(key) ?? null;
}
