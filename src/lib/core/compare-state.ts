import type { FactItem } from './view.ts';

// Client-safe part of the comparison: no runtime imports, so the page can load it without the
// content pipeline (see compare.ts for the part that needs the content).

/** Default maximum number of tools in one comparison. */
export const COMPARE_MAX = 3;

const PARAM = 'tools';

/**
 * Reads the `tools` parameter of a query string (with or without the leading `?`). Returns the
 * ids that are in `knownIds`, in query order, without duplicates, at most `max` of them. Unknown
 * ids are ignored before the cap is applied.
 */
export function parseCompareQuery(
	search: string,
	knownIds: Iterable<string>,
	max: number = COMPARE_MAX
): string[] {
	const known = new Set(knownIds);
	const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
	const wanted = params
		.getAll(PARAM)
		.flatMap((raw) => raw.split(','))
		.map((id) => id.trim())
		.filter((id) => id !== '' && known.has(id));
	return [...new Set(wanted)].slice(0, Math.max(0, max));
}

/** Serializes ids as `tools=a,b,c` (literal commas, no leading `?`). Empty list gives ''. */
export function compareQuery(ids: readonly string[]): string {
	return ids.length === 0 ? '' : `${PARAM}=${ids.map(encodeURIComponent).join(',')}`;
}

/** The ids after checking (`checked`) or unchecking `id`. A new id is added only below `max`. */
export function toggleCompareId(
	ids: readonly string[],
	id: string,
	checked: boolean,
	max: number = COMPARE_MAX
): string[] {
	if (!checked) return ids.filter((item) => item !== id);
	if (ids.includes(id) || ids.length >= max) return [...ids];
	return [...ids, id];
}

/** True when `id` cannot be added: it is not selected and the maximum is reached. */
export function isCompareOptionDisabled(
	ids: readonly string[],
	id: string,
	max: number = COMPARE_MAX
): boolean {
	return !ids.includes(id) && ids.length >= max;
}

export type CompareColumn = {
	id: string;
	name: string;
	url: string;
	host: string;
	status: { id: string; label: string };
};

export type CompareCell = { toolId: string; missing: boolean; items: FactItem[] };
export type CompareRow = { key: string; label: string; cells: CompareCell[] };
export type CompareView = { columns: CompareColumn[]; rows: CompareRow[] };

/**
 * The view of the selected tools taken from a view that holds more of them: columns follow `ids`
 * (ids not in the view are ignored), cells follow the columns, and rows that none of the
 * selected tools records are dropped. Equal to building the view for those ids.
 */
export function selectCompareView(view: CompareView, ids: readonly string[]): CompareView {
	const columns = ids.flatMap((id) => view.columns.filter((column) => column.id === id));
	const rows = view.rows.flatMap((row) => {
		const cells = columns.flatMap((column) =>
			row.cells.filter((cell) => cell.toolId === column.id)
		);
		return cells.some((cell) => !cell.missing) ? [{ ...row, cells }] : [];
	});
	return { columns, rows };
}
