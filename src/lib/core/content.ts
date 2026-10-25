import { parse } from 'yaml';
import { z } from 'zod';
import {
	caveatsSchema,
	finderSchema,
	isIsoDate,
	sectionsSchema,
	siteSchema,
	taxonomySchema,
	toolSchema,
	TAXONOMY_GROUPS,
	type Caveats,
	type Finder,
	type Sections,
	type Site,
	type Taxonomy,
	type Tool
} from './schema.ts';
import { localIsoDate } from './freshness.ts';

export type Issue = { file: string; path: string; message: string };

export type Content = {
	site: Site;
	taxonomy: Taxonomy;
	sections: Sections;
	finder: Finder;
	caveats: Caveats;
	/** Sorted by id (plain string order). */
	tools: Tool[];
};

export type LoadOptions = {
	/**
	 * Reference date for the "not in the future" check on `last_verified`. Defaults to now.
	 * Only its LOCAL calendar date counts.
	 */
	today?: Date;
};

export class ContentError extends Error {
	issues: Issue[];

	constructor(issues: Issue[]) {
		const lines = issues.map(
			(issue) => `${issue.file}: ${issue.path || '(root)'}: ${issue.message}`
		);
		super(`Content is invalid (${issues.length} issue(s)):\n${lines.join('\n')}`);
		this.name = 'ContentError';
		this.issues = issues;
	}
}

const SITE = 'content/site.yaml';
const TAXONOMY = 'content/taxonomy.yaml';
const SECTIONS = 'content/sections.yaml';
const FINDER = 'content/finder.yaml';
const CAVEATS = 'content/caveats.yaml';
const TOOL_FILE = /^content\/tools\/([^/]+)\.yaml$/;
const KNOWN_FILES = new Set([SITE, TAXONOMY, SECTIONS, FINDER, CAVEATS]);

const DOI_URL = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?(10\.\d{4,9}\/\S+)$/i;
const URL_KEYS = new Set(['url', 'source_code', 'repository', 'contributeUrl']);

/** Rewrites DOI forms (`10.x/y`, `doi:10.x/y`, `http://dx.doi.org/10.x/y`) to `https://doi.org/10.x/y`. */
export function normalizeDoiUrl(value: string): string {
	const match = DOI_URL.exec(value.trim());
	return match ? `https://doi.org/${match[1]}` : value;
}

function normalizeDoiFields(value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value) normalizeDoiFields(item);
	} else if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		for (const [key, item] of Object.entries(record)) {
			if (URL_KEYS.has(key) && typeof item === 'string') record[key] = normalizeDoiUrl(item);
			else normalizeDoiFields(item);
		}
	}
}

function fromZod(file: string, error: z.ZodError): Issue[] {
	return error.issues.flatMap((issue) => {
		const base = issue.path.map(String);
		if (issue.code === 'unrecognized_keys') {
			return issue.keys.map((key) => ({
				file,
				path: [...base, key].join('.'),
				message: `Unknown key "${key}"`
			}));
		}
		return [{ file, path: base.join('.'), message: issue.message }];
	});
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** A localized map: an object of strings that has an `en` or `es` key. */
function isLocalizedMap(value: unknown): value is Record<string, string> {
	return (
		isPlainRecord(value) &&
		('en' in value || 'es' in value) &&
		Object.values(value).every((item) => typeof item === 'string')
	);
}

function visitLocalized(
	value: unknown,
	path: string[],
	visit: (path: string[], map: Record<string, string>) => void
): void {
	if (isLocalizedMap(value)) {
		visit(path, value);
	} else if (Array.isArray(value)) {
		value.forEach((item, index) => visitLocalized(item, [...path, String(index)], visit));
	} else if (isPlainRecord(value)) {
		for (const [key, item] of Object.entries(value)) visitLocalized(item, [...path, key], visit);
	}
}

/**
 * Loads, validates and cross-checks content. `files` maps `content/site.yaml`,
 * `content/tools/<id>.yaml`, ... to the raw YAML text. Throws a ContentError listing every
 * problem with its file and path.
 */
export function loadContent(files: Record<string, string>, options: LoadOptions = {}): Content {
	const issues: Issue[] = [];
	const add = (file: string, path: string, message: string) => issues.push({ file, path, message });

	function load<S extends z.ZodType>(file: string, schema: S): z.infer<S> | undefined {
		const raw = files[file];
		if (raw === undefined) {
			add(file, '', 'File is missing');
			return undefined;
		}
		let data: unknown;
		try {
			data = parse(raw);
		} catch (error) {
			add(
				file,
				'',
				`Invalid YAML: ${error instanceof Error ? error.message.split('\n')[0] : error}`
			);
			return undefined;
		}
		normalizeDoiFields(data);
		const result = schema.safeParse(data);
		if (!result.success) {
			issues.push(...fromZod(file, result.error));
			return undefined;
		}
		return result.data;
	}

	// Anything under content/ that is not a known file or content/tools/<name>.yaml is a mistake
	// (a typo in a file name would otherwise be silently ignored).
	for (const file of Object.keys(files).sort()) {
		if (file.startsWith('content/') && !KNOWN_FILES.has(file) && !TOOL_FILE.test(file)) {
			add(
				file,
				'',
				'Unexpected file (allowed: content/{site,taxonomy,sections,finder,caveats}.yaml and content/tools/<id>.yaml)'
			);
		}
	}

	const site = load(SITE, siteSchema);
	const taxonomy = load(TAXONOMY, taxonomySchema);
	const sections = load(SECTIONS, sectionsSchema);
	const finder = load(FINDER, finderSchema);
	const caveats = load(CAVEATS, caveatsSchema);

	const tools: { file: string; tool: Tool }[] = [];
	const toolFiles = Object.keys(files)
		.filter((file) => {
			const name = TOOL_FILE.exec(file)?.[1];
			return name !== undefined && !name.startsWith('_');
		})
		.sort();
	for (const file of toolFiles) {
		const tool = load(file, toolSchema);
		if (tool) tools.push({ file, tool });
	}

	const loaded: { file: string; data: unknown }[] = [
		{ file: SITE, data: site },
		{ file: TAXONOMY, data: taxonomy },
		{ file: SECTIONS, data: sections },
		{ file: FINDER, data: finder },
		{ file: CAVEATS, data: caveats },
		...tools.map(({ file, tool }) => ({ file, data: tool }))
	];

	// Locales: declared in site.yaml, required and exclusive on every localized field.
	if (site) {
		if (!site.locales.includes(site.defaultLocale)) {
			add(SITE, 'defaultLocale', `defaultLocale "${site.defaultLocale}" is not in locales`);
		}
		for (const locale of Object.keys(site.style.forbiddenTerms)) {
			if (!site.locales.includes(locale)) {
				add(
					SITE,
					`style.forbiddenTerms.${locale}`,
					`Locale "${locale}" is not declared in site.yaml locales`
				);
			}
		}
		for (const { file, data } of loaded) {
			visitLocalized(data, [], (path, map) => {
				const at = (locale: string) => [...path, locale].join('.');
				for (const locale of Object.keys(map)) {
					if (!site.locales.includes(locale)) {
						add(file, at(locale), `Locale "${locale}" is not declared in site.yaml locales`);
					}
				}
				for (const locale of site.locales) {
					if (!(locale in map)) add(file, at(locale), `Missing translation for locale "${locale}"`);
					else if (locale !== site.defaultLocale && /^\s*TODO\b/.test(map[locale])) {
						add(file, at(locale), 'Placeholder "TODO" left in a non-default locale');
					}
				}
			});
		}
	}

	// Unique ids.
	if (sections) {
		const seen = new Set<string>();
		sections.forEach((section, index) => {
			if (seen.has(section.id))
				add(SECTIONS, `${index}.id`, `Duplicate section id "${section.id}"`);
			seen.add(section.id);
		});
	}
	if (caveats) {
		const seen = new Set<string>();
		caveats.forEach((caveat, index) => {
			if (seen.has(caveat.id)) add(CAVEATS, `${index}.id`, `Duplicate caveat id "${caveat.id}"`);
			seen.add(caveat.id);
		});
	}
	const taxonomyIds: Record<string, Set<string>> = {};
	if (taxonomy) {
		for (const group of TAXONOMY_GROUPS) {
			const seen = new Set<string>();
			taxonomy[group].forEach((value, index) => {
				if (seen.has(value.id)) {
					add(TAXONOMY, `${group}.${index}.id`, `Duplicate id "${value.id}" in ${group}`);
				}
				seen.add(value.id);
			});
			taxonomyIds[group] = seen;
		}
		const groups: readonly string[] = TAXONOMY_GROUPS;
		const seenFilters = new Set<string>();
		taxonomy.filters.forEach((group, index) => {
			if (!groups.includes(group)) {
				add(TAXONOMY, `filters.${index}`, `Unknown taxonomy group "${group}"`);
			}
			if (seenFilters.has(group)) add(TAXONOMY, `filters.${index}`, `Duplicate filter "${group}"`);
			seenFilters.add(group);
		});
	}
	const toolIds = new Set<string>();
	for (const { file, tool } of tools) {
		const name = TOOL_FILE.exec(file)?.[1];
		if (tool.id !== name) add(file, 'id', `id "${tool.id}" must equal the file name "${name}"`);
		if (toolIds.has(tool.id)) add(file, 'id', `Duplicate tool id "${tool.id}"`);
		toolIds.add(tool.id);
	}

	// References resolve, dates are not in the future.
	const today = localIsoDate(options.today ?? new Date());
	const sectionIds = new Set(sections?.map((section) => section.id));
	for (const { file, tool } of tools) {
		if (sections && !sectionIds.has(tool.section)) {
			add(file, 'section', `Unknown section "${tool.section}"`);
		}
		if (taxonomy) {
			const check = (group: string, value: string, path: string) => {
				if (!taxonomyIds[group].has(value)) add(file, path, `Unknown ${group} id "${value}"`);
			};
			tool.targets?.forEach((value, index) => check('target', value, `targets.${index}`));
			if (tool.mode !== undefined) check('mode', tool.mode, 'mode');
			tool.inputs?.forEach((value, index) => check('input', value, `inputs.${index}`));
			tool.frameworks?.forEach((value, index) => check('framework', value, `frameworks.${index}`));
			check('status', tool.status, 'status');
		}
		if (isIsoDate(tool.last_verified) && tool.last_verified > today) {
			add(file, 'last_verified', `last_verified ${tool.last_verified} is in the future`);
		}
	}

	// Finder rows only list existing tools that accept the row input.
	if (finder) {
		const byId = new Map(tools.map(({ tool }) => [tool.id, tool]));
		const seenInputs = new Set<string>();
		finder.rows.forEach((row, rowIndex) => {
			if (seenInputs.has(row.input)) {
				add(FINDER, `rows.${rowIndex}.input`, `Duplicate finder row for input "${row.input}"`);
			}
			seenInputs.add(row.input);
			const seenTools = new Set<string>();
			const inputKnown = taxonomy ? taxonomyIds.input.has(row.input) : true;
			if (!inputKnown) add(FINDER, `rows.${rowIndex}.input`, `Unknown input id "${row.input}"`);
			row.tools.forEach((id, toolIndex) => {
				const path = `rows.${rowIndex}.tools.${toolIndex}`;
				if (seenTools.has(id)) add(FINDER, path, `Duplicate tool id "${id}" in this row`);
				seenTools.add(id);
				const tool = byId.get(id);
				if (!tool) {
					// Only report when every tool file loaded; otherwise the tool's own issues explain it.
					if (tools.length === toolFiles.length) add(FINDER, path, `Unknown tool id "${id}"`);
				} else if (inputKnown && !tool.inputs?.includes(row.input)) {
					add(FINDER, path, `Tool "${id}" does not accept input "${row.input}"`);
				}
			});
		});
	}

	if (issues.length > 0) throw new ContentError(issues);

	return {
		site: site!,
		taxonomy: taxonomy!,
		sections: sections!,
		finder: finder!,
		caveats: caveats!,
		tools: tools.map(({ tool }) => tool).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
	};
}

let cached: Content | undefined;

/** Loads the real YAML files under content/ bundled at build time. Throws ContentError when invalid. */
export function getContent(): Content {
	if (cached) return cached;
	const modules = import.meta.glob('/content/**/*.yaml', { query: '?raw', eager: true }) as Record<
		string,
		{ default: string }
	>;
	const files: Record<string, string> = {};
	for (const [path, module] of Object.entries(modules)) {
		files[path.replace(/^\//, '')] = module.default;
	}
	cached = loadContent(files);
	return cached;
}
