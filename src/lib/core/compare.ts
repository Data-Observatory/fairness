import type { Content } from './content.ts';
import { FACT_LABELS, type Locale } from './labels.ts';
import type { Tool } from './schema.ts';
import { buildToolView, type FactItem } from './view.ts';

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

export type ComparableEntry = { id: string; name: string; url: string };

function homeOrder(content: Content): Tool[] {
	return content.sections.flatMap((section) =>
		content.tools.filter((tool) => tool.section === section.id)
	);
}

/** Entries that can be compared (kind `tool` only), in home order. */
export function comparableEntries(content: Content): ComparableEntry[] {
	return homeOrder(content)
		.filter((tool) => tool.kind === 'tool')
		.map((tool) => ({ id: tool.id, name: tool.name, url: tool.url }));
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

const FACT_ORDER: readonly string[] = Object.keys(FACT_LABELS.en);

/**
 * Columns follow `ids`. Rows are the fact keys recorded by at least one of the tools, in the
 * order of FACT_LABELS, with one cell per tool (`missing: true` and no items when not recorded).
 * Throws for an unknown id.
 */
export function buildCompareView(
	content: Content,
	ids: readonly string[],
	locale: Locale,
	today: Date
): CompareView {
	const views = ids.map((id) => buildToolView(content, id, locale, today));
	const columns = views.map((view) => {
		const status = view.chips.find((chip) => chip.kind === 'status');
		return {
			id: view.id,
			name: view.name,
			url: view.url,
			host: view.host,
			status: { id: status?.id ?? '', label: status?.label ?? '' }
		};
	});
	const keys = [...new Set(views.flatMap((view) => view.facts.map((fact) => fact.key)))].sort(
		(a, b) => FACT_ORDER.indexOf(a) - FACT_ORDER.indexOf(b)
	);
	const rows = keys.map((key) => ({
		key,
		label: FACT_LABELS[locale][key],
		cells: views.map((view) => {
			const fact = view.facts.find((item) => item.key === key);
			return fact === undefined
				? { toolId: view.id, missing: true, items: [] }
				: { toolId: view.id, missing: false, items: fact.items };
		})
	}));
	return { columns, rows };
}
