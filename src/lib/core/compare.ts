import type { Content } from './content.ts';
import { COMPARE_MAX, type CompareView } from './compare-state.ts';
import { FACT_LABELS, type Locale } from './labels.ts';
import type { Tool } from './schema.ts';
import { buildToolView } from './view.ts';

// The selection helpers and the view types live in compare-state.ts, which has no runtime
// imports so the browser can load it without the content pipeline. They are re-exported here.
export {
	COMPARE_MAX,
	compareQuery,
	isCompareOptionDisabled,
	parseCompareQuery,
	selectCompareView,
	toggleCompareId
} from './compare-state.ts';
export type { CompareCell, CompareColumn, CompareRow, CompareView } from './compare-state.ts';

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

export type ComparePage = {
	/** Sections that hold at least one tool, with their tools, in home order. */
	sections: { id: string; title: string; tools: { id: string; name: string }[] }[];
	/** One column for every comparable tool; the page selects the columns it shows. */
	view: CompareView;
	caveats: string[];
	max: number;
};

/** Everything the comparison page needs, for one locale. */
export function buildComparePage(content: Content, locale: Locale, today: Date): ComparePage {
	const entries = comparableEntries(content);
	const sections = content.sections.flatMap((section) => {
		const tools = homeOrder(content)
			.filter((tool) => tool.section === section.id && tool.kind === 'tool')
			.map((tool) => ({ id: tool.id, name: tool.name }));
		return tools.length === 0 ? [] : [{ id: section.id, title: section.title[locale], tools }];
	});
	return {
		sections,
		view: buildCompareView(
			content,
			entries.map((entry) => entry.id),
			locale,
			today
		),
		caveats: content.caveats.map((item) => item.text[locale]),
		max: COMPARE_MAX
	};
}
