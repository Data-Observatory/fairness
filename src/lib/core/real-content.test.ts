import { describe, expect, it } from 'vitest';
import { getContent, loadContent, type Content } from './content';
import { daysSince } from './freshness';
import { lintContent, lintMessages } from './style-lint';
import type { Tool } from './schema';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';

// Tests the REAL content/ directory. Nothing here fixes marketing text: only structure,
// evidence rules and basic sanity checks. Loading is lazy (inside each test), so a broken or
// empty content/ directory fails every test with the same ContentError.

const content = (): Content => getContent();
const tool = (id: string): Tool => {
	const found = content().tools.find((item) => item.id === id);
	if (!found) throw new Error(`Tool "${id}" not found in content/tools`);
	return found;
};

const REQUIRED_TOOL_IDS = [
	'f-uji',
	'fair-enough',
	'fair-champion',
	'fair-checker',
	'fair-evaluator',
	'fairshake',
	'ardc-fair-data-self-assessment',
	'fair-aware',
	'fair-eva',
	'ofaire',
	'foops',
	'fairassist',
	'fair-impact-catalogue'
];
const SECTION_IDS = ['datasets', 'other-objects', 'frameworks', 'directories'];
const FINDER_INPUTS = ['doi', 'landing_page_url', 'metadata_file', 'none'];
const MAX_AGE_DAYS = 30;

function urlsOf(item: Tool): { path: string; value: string }[] {
	const urls: { path: string; value: string }[] = [{ path: 'url', value: item.url }];
	if (item.operator.url) urls.push({ path: 'operator.url', value: item.operator.url });
	if (item.api?.url) urls.push({ path: 'api.url', value: item.api.url });
	if (item.source_code) urls.push({ path: 'source_code', value: item.source_code });
	item.references?.forEach((reference, index) =>
		urls.push({ path: `references.${index}.url`, value: reference.url })
	);
	return urls;
}

function rawFiles(): Record<string, string> {
	const modules = import.meta.glob('/content/**/*.yaml', { query: '?raw', eager: true }) as Record<
		string,
		{ default: string }
	>;
	const files: Record<string, string> = {};
	for (const [path, module] of Object.entries(modules)) {
		files[path.replace(/^\//, '')] = module.default;
	}
	return files;
}

describe('real content: loading and style', () => {
	it('loads with no ContentError', () => {
		expect(() => getContent()).not.toThrow();
		expect(content().tools.length).toBeGreaterThan(0);
	});

	it('has zero style violations in content', () => {
		expect(lintContent(content())).toEqual([]);
	});

	it('has zero style violations in messages/en.json and messages/es.json', () => {
		const violations = lintMessages({ en, es }, content().site.style);
		expect(violations).toEqual([]);
	});

	it('loading twice gives deep-equal results', () => {
		const files = rawFiles();
		expect(Object.keys(files).length).toBeGreaterThan(0);
		const first = loadContent(files);
		const second = loadContent(files);
		expect(second).toEqual(first);
		expect(first.tools.map((item) => item.id)).toEqual(
			[...first.tools.map((item) => item.id)].sort()
		);
	});
});

describe('real content: required entries', () => {
	it('has every required tool id', () => {
		const ids = content().tools.map((item) => item.id);
		for (const id of REQUIRED_TOOL_IDS) expect(ids).toContain(id);
	});

	it('has at least 2 entries in the frameworks section', () => {
		const frameworks = content().tools.filter((item) => item.section === 'frameworks');
		expect(frameworks.length).toBeGreaterThanOrEqual(2);
	});

	it('has unique ids', () => {
		const ids = content().tools.map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.length).toBeGreaterThan(0);
	});
});

describe('real content: sections', () => {
	it('has exactly datasets, other-objects, frameworks, directories in that order', () => {
		expect(content().sections.map((section) => section.id)).toEqual(SECTION_IDS);
	});

	it('gives every section at least one tool', () => {
		const { sections, tools } = content();
		for (const section of sections) {
			expect(tools.filter((item) => item.section === section.id).length).toBeGreaterThanOrEqual(1);
		}
	});

	it('puts every tool in an existing section', () => {
		const { sections, tools } = content();
		const ids = new Set(sections.map((section) => section.id));
		expect(tools.length).toBeGreaterThan(0);
		for (const item of tools) expect(ids.has(item.section)).toBe(true);
	});
});

describe('real content: tool fields', () => {
	it('gives every kind tool non-empty best_for, targets, mode, inputs and output', () => {
		const tools = content().tools.filter((item) => item.kind === 'tool');
		expect(tools.length).toBeGreaterThan(0);
		for (const item of tools) {
			for (const locale of ['en', 'es']) {
				expect(item.best_for?.[locale]?.trim(), `${item.id} best_for.${locale}`).toBeTruthy();
				expect(item.output?.[locale]?.trim(), `${item.id} output.${locale}`).toBeTruthy();
			}
			expect(item.targets?.length, `${item.id} targets`).toBeGreaterThan(0);
			expect(item.mode?.trim(), `${item.id} mode`).toBeTruthy();
			expect(item.inputs?.length, `${item.id} inputs`).toBeGreaterThan(0);
		}
	});

	it('gives every entry a summary in en and es', () => {
		const { tools } = content();
		expect(tools.length).toBeGreaterThan(0);
		for (const item of tools) {
			expect(item.summary.en.trim(), `${item.id} summary.en`).not.toBe('');
			expect(item.summary.es.trim(), `${item.id} summary.es`).not.toBe('');
		}
	});

	it('has Spanish text that differs from the English text (summary, best_for, output)', () => {
		const { tools } = content();
		expect(tools.length).toBeGreaterThan(0);
		for (const item of tools) {
			const pairs = [
				['summary', item.summary],
				['best_for', item.best_for],
				['output', item.output]
			] as const;
			for (const [field, value] of pairs) {
				if (value === undefined) continue;
				expect(value.es.trim(), `${item.id} ${field}: es equals en`).not.toBe(value.en.trim());
			}
		}
	});

	it('uses https for every URL, parses it, and never points to localhost', () => {
		const { tools, site } = content();
		const all = [
			{ path: 'site.repository', value: site.repository },
			{ path: 'site.contributeUrl', value: site.contributeUrl },
			...tools.flatMap((item) =>
				urlsOf(item).map(({ path, value }) => ({ path: `${item.id} ${path}`, value }))
			)
		];
		expect(all.length).toBeGreaterThan(0);
		for (const { path, value } of all) {
			const url = new URL(value);
			expect(url.protocol, path).toBe('https:');
			expect(url.hostname, path).not.toBe('');
			expect(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'], path).not.toContain(
				url.hostname
			);
			expect(url.hostname.endsWith('.localhost'), path).toBe(false);
		}
	});

	it('has last_verified today or earlier and not older than 30 days', () => {
		const { tools } = content();
		const today = new Date();
		expect(tools.length).toBeGreaterThan(0);
		for (const item of tools) {
			const age = daysSince(item.last_verified, today);
			expect(
				age,
				`${item.id} last_verified ${item.last_verified} is in the future`
			).toBeGreaterThanOrEqual(0);
			expect(age, `${item.id} last_verified ${item.last_verified} is too old`).toBeLessThanOrEqual(
				MAX_AGE_DAYS
			);
		}
	});

	it('carries evidence for non-available statuses', () => {
		const { tools } = content();
		expect(tools.length).toBeGreaterThan(0);
		for (const item of tools) {
			if (item.status === 'limited' || item.status === 'unverified') {
				expect(item.status_note, `${item.id} status_note`).toBeDefined();
			}
			if (item.status === 'discontinued') {
				expect(item.references?.length ?? 0, `${item.id} references`).toBeGreaterThan(0);
			}
		}
	});
});

describe('real content: specific entries', () => {
	it('fair-aware targets person_knowledge and does not list dataset', () => {
		const item = tool('fair-aware');
		expect(item.targets).toContain('person_knowledge');
		expect(item.targets).not.toContain('dataset');
	});

	it('foops and ofaire target ontology', () => {
		expect(tool('foops').targets).toContain('ontology');
		expect(tool('ofaire').targets).toContain('ontology');
	});

	it('fair-evaluator is not available unless it has a status_note', () => {
		const item = tool('fair-evaluator');
		expect(item.status !== 'available' || item.status_note !== undefined).toBe(true);
	});

	it('f-uji lists doi among its inputs', () => {
		expect(tool('f-uji').inputs).toContain('doi');
	});
});

describe('real content: finder and caveats', () => {
	it('has a finder row for doi, landing_page_url, metadata_file and none', () => {
		const inputs = content().finder.rows.map((row) => row.input);
		for (const input of FINDER_INPUTS) expect(inputs).toContain(input);
	});

	it('lists at least one tool in every finder row', () => {
		const { rows } = content().finder;
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) expect(row.tools.length, `row ${row.input}`).toBeGreaterThanOrEqual(1);
	});

	it('has at least 3 caveats mentioning metric and differ (en) and non-empty es', () => {
		const { caveats } = content();
		expect(caveats.length).toBeGreaterThanOrEqual(3);
		const english = caveats.map((caveat) => caveat.text.en).join(' ');
		expect(english).toMatch(/metric/i);
		expect(english).toMatch(/differ/i);
		for (const caveat of caveats) expect(caveat.text.es.trim()).not.toBe('');
	});
});

describe('real content: site.yaml', () => {
	it('declares locales, default locale and features', () => {
		const { site } = content();
		expect(site.locales).toEqual(['en', 'es']);
		expect(site.defaultLocale).toBe('en');
		expect(site.features.bestFor).toBe(true);
	});

	it('has a positive integer staleAfterDays', () => {
		const days = content().site.verification.staleAfterDays;
		expect(Number.isInteger(days)).toBe(true);
		expect(days).toBeGreaterThan(0);
	});

	it('has a hostname as domain', () => {
		const { domain } = content().site;
		expect(domain).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i);
		expect(new URL(`https://${domain}`).hostname).toBe(domain.toLowerCase());
	});
});

describe('real content: site.shortName', () => {
	it('exists in en and es, 2 to 12 characters each', () => {
		const { shortName } = content().site;
		expect(shortName, 'content/site.yaml needs a shortName for the nav brand').toBeDefined();
		for (const locale of ['en', 'es'] as const) {
			const value = shortName![locale];
			expect(value.trim(), locale).toBe(value);
			expect(value.length, locale).toBeGreaterThanOrEqual(2);
			expect(value.length, locale).toBeLessThanOrEqual(12);
		}
	});
});
