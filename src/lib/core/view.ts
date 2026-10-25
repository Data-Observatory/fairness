import type { Content } from './content.ts';
import { FILTER_GROUPS, filterTools } from './filter.ts';
import { daysSince, isStale } from './freshness.ts';
import { FILTER_GROUP_LABELS, FACT_LABELS, type Locale } from './labels.ts';
import type { Localized, Tool, ToolKind } from './schema.ts';

export type { Locale } from './labels.ts';
export { FACT_LABELS, FILTER_GROUP_LABELS } from './labels.ts';

export type Chip = { kind: 'mode' | 'target' | 'status'; id: string; label: string };

export type ToolCard = {
	id: string;
	kind: ToolKind;
	name: string;
	summary: string;
	bestFor?: string;
	url: string;
	host: string;
	chips: Chip[];
	/** Taxonomy ids of the tool per filter group, so a page can filter without the content. */
	filterFields: Record<(typeof FILTER_GROUPS)[number], string[]>;
	stale: boolean;
};

export type HomeView = {
	siteName: string;
	shortName: string;
	tagline: string;
	caveats: string[];
	sections: {
		id: string;
		title: string;
		intro?: string;
		collapsed: boolean;
		tools: ToolCard[];
	}[];
	filterGroups: {
		id: string;
		label: string;
		options: { id: string; label: string; count: number }[];
	}[];
	finder:
		| {
				inputId: string;
				inputLabel: string;
				note?: string;
				tools: { id: string; name: string }[];
		  }[]
		| null;
};

export type FactItem = { text: string; href?: string };
export type Fact = { key: string; label: string; items: FactItem[] };

export type ToolView = ToolCard & {
	lastVerified: string;
	daysSinceVerified: number;
	statusNote?: string;
	facts: Fact[];
	api?: { available: boolean; url?: string };
	selfHostable?: boolean;
	references: { title: string; url: string; host: string }[];
};

const text = (value: Localized, locale: Locale): string => value[locale];

const hostOf = (url: string): string => new URL(url).hostname;

function labeler(content: Content, locale: Locale) {
	const labels = (group: 'target' | 'mode' | 'input' | 'framework' | 'status') =>
		new Map(content.taxonomy[group].map((value) => [value.id, text(value.label, locale)]));
	const maps = {
		target: labels('target'),
		mode: labels('mode'),
		input: labels('input'),
		framework: labels('framework'),
		status: labels('status')
	};
	return (group: keyof typeof maps, id: string): string => maps[group].get(id) ?? id;
}

function chipsOf(tool: Tool, label: ReturnType<typeof labeler>): Chip[] {
	return [
		...(tool.mode === undefined
			? []
			: [{ kind: 'mode' as const, id: tool.mode, label: label('mode', tool.mode) }]),
		...(tool.targets ?? []).map((id) => ({
			kind: 'target' as const,
			id,
			label: label('target', id)
		})),
		{ kind: 'status' as const, id: tool.status, label: label('status', tool.status) }
	];
}

function cardOf(
	content: Content,
	tool: Tool,
	locale: Locale,
	today: Date,
	label: ReturnType<typeof labeler>
): ToolCard {
	return {
		id: tool.id,
		kind: tool.kind,
		name: tool.name,
		summary: text(tool.summary, locale),
		bestFor:
			content.site.features.bestFor && tool.best_for !== undefined
				? text(tool.best_for, locale)
				: undefined,
		url: tool.url,
		host: hostOf(tool.url),
		chips: chipsOf(tool, label),
		filterFields: {
			target: [...(tool.targets ?? [])],
			mode: tool.mode === undefined ? [] : [tool.mode],
			input: [...(tool.inputs ?? [])],
			framework: [...(tool.frameworks ?? [])],
			status: [tool.status]
		},
		stale: isStale(tool, today, content.site.verification.staleAfterDays)
	};
}

function filterGroupsOf(content: Content, locale: Locale): HomeView['filterGroups'] {
	const known: readonly string[] = FILTER_GROUPS;
	return content.taxonomy.filters
		.filter((id) => known.includes(id))
		.filter((id) => id !== 'status' || content.site.features.statusFilter)
		.map((id) => {
			const group = id as (typeof FILTER_GROUPS)[number];
			return {
				id,
				label: FILTER_GROUP_LABELS[locale][id],
				options: content.taxonomy[group].map((option) => ({
					id: option.id,
					label: text(option.label, locale),
					count: filterTools(content.tools, { [id]: [option.id] }).length
				}))
			};
		});
}

export function buildHomeView(content: Content, locale: Locale, today: Date): HomeView {
	const label = labeler(content, locale);
	const toolName = new Map(content.tools.map((tool) => [tool.id, tool.name]));
	return {
		siteName: text(content.site.name, locale),
		shortName: text(content.site.shortName ?? content.site.name, locale),
		tagline: text(content.site.tagline, locale),
		caveats: content.caveats.map((item) => text(item.text, locale)),
		sections: content.sections.map((section) => ({
			id: section.id,
			title: text(section.title, locale),
			intro: section.intro === undefined ? undefined : text(section.intro, locale),
			collapsed: section.collapsed ?? false,
			tools: content.tools
				.filter((tool) => tool.section === section.id)
				.map((tool) => cardOf(content, tool, locale, today, label))
		})),
		filterGroups: filterGroupsOf(content, locale),
		finder: content.site.features.finderTable
			? content.finder.rows.map((row) => ({
					inputId: row.input,
					inputLabel: label('input', row.input),
					note: row.note === undefined ? undefined : text(row.note, locale),
					tools: row.tools.map((id) => ({ id, name: toolName.get(id) ?? id }))
				}))
			: null
	};
}

function factsOf(tool: Tool, locale: Locale, label: ReturnType<typeof labeler>): Fact[] {
	const labels = FACT_LABELS[locale];
	const entries: [string, FactItem[] | undefined][] = [
		['operator', [{ text: tool.operator.name, href: tool.operator.url }]],
		['targets', tool.targets?.map((id) => ({ text: label('target', id) }))],
		['mode', tool.mode === undefined ? undefined : [{ text: label('mode', tool.mode) }]],
		['inputs', tool.inputs?.map((id) => ({ text: label('input', id) }))],
		['frameworks', tool.frameworks?.map((id) => ({ text: label('framework', id) }))],
		['output', tool.output === undefined ? undefined : [{ text: text(tool.output, locale) }]],
		[
			'source_code',
			tool.source_code === undefined
				? undefined
				: [{ text: tool.source_code, href: tool.source_code }]
		],
		['license', tool.license === undefined ? undefined : [{ text: tool.license }]],
		['status', [{ text: label('status', tool.status) }]]
	];
	return entries.flatMap(([key, items]) =>
		items === undefined || items.length === 0 ? [] : [{ key, label: labels[key], items }]
	);
}

export function buildToolView(content: Content, id: string, locale: Locale, today: Date): ToolView {
	const tool = content.tools.find((item) => item.id === id);
	if (!tool) throw new Error(`Unknown tool id: ${id}`);
	const label = labeler(content, locale);
	return {
		...cardOf(content, tool, locale, today, label),
		lastVerified: tool.last_verified,
		daysSinceVerified: daysSince(tool.last_verified, today),
		statusNote: tool.status_note === undefined ? undefined : text(tool.status_note, locale),
		facts: factsOf(tool, locale, label),
		api: tool.api,
		selfHostable: tool.self_hostable,
		references: (tool.references ?? []).map((ref) => ({ ...ref, host: hostOf(ref.url) }))
	};
}
