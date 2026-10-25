import type { Tool } from './schema.ts';

/** Filter groups in canonical (query string and display) order. */
export const FILTER_GROUPS = ['target', 'mode', 'input', 'framework', 'status'] as const;

/** Selected taxonomy ids per filter group. Missing or empty groups impose no constraint. */
export type Selection = Record<string, string[] | undefined>;

function valuesOf(tool: Tool, group: string): string[] {
	switch (group) {
		case 'target':
			return tool.targets ?? [];
		case 'mode':
			return tool.mode === undefined ? [] : [tool.mode];
		case 'input':
			return tool.inputs ?? [];
		case 'framework':
			return tool.frameworks ?? [];
		case 'status':
			return [tool.status];
		default:
			return [];
	}
}

/**
 * OR within a group, AND across groups. Entries that lack a field never match a
 * non-empty selection on it. Groups that are not in FILTER_GROUPS are ignored.
 * Returns a new array in the original order.
 */
export function filterTools(tools: readonly Tool[], selection: Selection): Tool[] {
	const known: readonly string[] = FILTER_GROUPS;
	const active = Object.entries(selection).filter(
		(entry): entry is [string, string[]] => known.includes(entry[0]) && (entry[1]?.length ?? 0) > 0
	);
	return tools.filter((tool) =>
		active.every(([group, wanted]) => valuesOf(tool, group).some((value) => wanted.includes(value)))
	);
}

function normalize(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ''))].sort();
}

function orderedGroups(selection: Selection): string[] {
	const known: readonly string[] = FILTER_GROUPS;
	const extra = Object.keys(selection)
		.filter((group) => !known.includes(group))
		.sort();
	return [...FILTER_GROUPS, ...extra];
}

/** Canonical query: groups in canonical order, values sorted, de-duplicated, comma separated. */
export function selectionToQuery(selection: Selection): URLSearchParams {
	const query = new URLSearchParams();
	for (const group of orderedGroups(selection)) {
		const values = normalize(selection[group] ?? []);
		// URLSearchParams encodes the comma as %2C; that is the canonical form.
		if (values.length > 0) query.set(group, values.join(','));
	}
	return query;
}

/** Parses a query into a selection, keeping only `allowedGroups`. Empty groups are omitted. */
export function selectionFromQuery(
	params: URLSearchParams,
	allowedGroups: readonly string[]
): Selection {
	const selection: Selection = {};
	for (const group of allowedGroups) {
		const values = normalize(params.getAll(group).flatMap((raw) => raw.split(',')));
		if (values.length > 0) selection[group] = values;
	}
	return selection;
}
