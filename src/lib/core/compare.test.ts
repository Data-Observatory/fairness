import { describe, expect, it } from 'vitest';
import {
	COMPARE_MAX,
	buildCompareView,
	compareQuery,
	comparableEntries,
	parseCompareQuery
} from './compare';
import { loadContent } from './content';
import { loadFixtureFiles, mutate } from './__fixtures__/helpers';
import { FACT_LABELS } from './labels';
import { buildToolView } from './view';

const TODAY = new Date(2025, 5, 1);
const KNOWN = ['f-uji', 'fair-enough', 'fair-catalogue', 'fairsfair-metrics'];

const fixture = () => loadContent(loadFixtureFiles(), { today: TODAY });

describe('parseCompareQuery', () => {
	it('exports a default maximum of 3', () => {
		expect(COMPARE_MAX).toBe(3);
	});

	it('returns the known ids in the order of the query', () => {
		expect(parseCompareQuery('tools=fair-enough,f-uji', KNOWN)).toEqual(['fair-enough', 'f-uji']);
	});

	it('accepts a leading question mark', () => {
		expect(parseCompareQuery('?tools=f-uji,fair-enough', KNOWN)).toEqual(['f-uji', 'fair-enough']);
	});

	it('returns an empty list for an empty query, a missing parameter or an empty value', () => {
		expect(parseCompareQuery('', KNOWN)).toEqual([]);
		expect(parseCompareQuery('?', KNOWN)).toEqual([]);
		expect(parseCompareQuery('other=f-uji', KNOWN)).toEqual([]);
		expect(parseCompareQuery('tools=', KNOWN)).toEqual([]);
	});

	it('ignores unknown ids', () => {
		expect(parseCompareQuery('tools=nope,f-uji,also-nope', KNOWN)).toEqual(['f-uji']);
	});

	it('de-duplicates and keeps the first position', () => {
		expect(parseCompareQuery('tools=f-uji,fair-enough,f-uji', KNOWN)).toEqual([
			'f-uji',
			'fair-enough'
		]);
	});

	it('caps the result at 3 by default', () => {
		expect(
			parseCompareQuery('tools=f-uji,fair-enough,fair-catalogue,fairsfair-metrics', KNOWN)
		).toEqual(['f-uji', 'fair-enough', 'fair-catalogue']);
	});

	it('caps after dropping unknown ids and duplicates', () => {
		expect(
			parseCompareQuery(
				'tools=nope,f-uji,f-uji,fair-enough,fair-catalogue,fairsfair-metrics',
				KNOWN
			)
		).toEqual(['f-uji', 'fair-enough', 'fair-catalogue']);
	});

	it('honours a custom maximum', () => {
		expect(parseCompareQuery('tools=f-uji,fair-enough,fair-catalogue', KNOWN, 2)).toEqual([
			'f-uji',
			'fair-enough'
		]);
		expect(parseCompareQuery('tools=f-uji,fair-enough', KNOWN, 0)).toEqual([]);
	});

	it('trims whitespace and skips empty items', () => {
		expect(parseCompareQuery('tools=%20f-uji%20,,fair-enough', KNOWN)).toEqual([
			'f-uji',
			'fair-enough'
		]);
	});

	it('reads an encoded comma and repeated parameters', () => {
		expect(parseCompareQuery('tools=f-uji%2Cfair-enough', KNOWN)).toEqual(['f-uji', 'fair-enough']);
		expect(parseCompareQuery('tools=f-uji&tools=fair-enough', KNOWN)).toEqual([
			'f-uji',
			'fair-enough'
		]);
	});

	it('matches ids case sensitively', () => {
		expect(parseCompareQuery('tools=F-UJI', KNOWN)).toEqual([]);
	});

	it('accepts any iterable of known ids', () => {
		expect(parseCompareQuery('tools=f-uji', new Set(KNOWN))).toEqual(['f-uji']);
	});
});

describe('compareQuery', () => {
	it('serializes ids as tools=a,b,c with literal commas', () => {
		expect(compareQuery(['f-uji', 'fair-enough', 'fair-catalogue'])).toBe(
			'tools=f-uji,fair-enough,fair-catalogue'
		);
	});

	it('serializes one id', () => {
		expect(compareQuery(['f-uji'])).toBe('tools=f-uji');
	});

	it('serializes an empty list as an empty string', () => {
		expect(compareQuery([])).toBe('');
	});

	it('round trips through parseCompareQuery', () => {
		const ids = ['fair-enough', 'f-uji', 'fair-catalogue'];
		expect(parseCompareQuery(compareQuery(ids), KNOWN)).toEqual(ids);
		expect(parseCompareQuery(`?${compareQuery(ids)}`, KNOWN)).toEqual(ids);
	});
});

describe('comparableEntries', () => {
	it('lists only entries of kind tool', () => {
		const entries = comparableEntries(fixture());
		expect(entries.map((entry) => entry.id).sort()).toEqual(['f-uji', 'fair-enough']);
	});

	it('follows the home order: sections in order, tools in content order', () => {
		const content = fixture();
		const home = content.sections.flatMap((section) =>
			content.tools.filter((tool) => tool.section === section.id)
		);
		expect(comparableEntries(content).map((entry) => entry.id)).toEqual(
			home.filter((tool) => tool.kind === 'tool').map((tool) => tool.id)
		);
	});

	it('gives id, name and url', () => {
		const entry = comparableEntries(fixture()).find((item) => item.id === 'f-uji');
		expect(entry).toEqual({ id: 'f-uji', name: 'F-UJI', url: 'https://example.org/f-uji' });
	});
});

describe('buildCompareView: columns', () => {
	it('gives one column per id in the requested order with name, url and status', () => {
		const view = buildCompareView(fixture(), ['fair-enough', 'f-uji'], 'en', TODAY);
		expect(view.columns).toEqual([
			{
				id: 'fair-enough',
				name: 'FAIR Enough',
				url: 'https://example.org/fair-enough',
				host: 'example.org',
				status: { id: 'available', label: 'Available' }
			},
			{
				id: 'f-uji',
				name: 'F-UJI',
				url: 'https://example.org/f-uji',
				host: 'example.org',
				status: { id: 'available', label: 'Available' }
			}
		]);
	});

	it('localizes the status label', () => {
		const view = buildCompareView(fixture(), ['f-uji'], 'es', TODAY);
		expect(view.columns[0].status).toEqual({ id: 'available', label: 'Disponible' });
	});

	it('returns no columns and no rows for an empty selection', () => {
		expect(buildCompareView(fixture(), [], 'en', TODAY)).toEqual({ columns: [], rows: [] });
	});

	it('throws for an unknown id', () => {
		expect(() => buildCompareView(fixture(), ['nope'], 'en', TODAY)).toThrow(/nope/);
	});
});

describe('buildCompareView: rows', () => {
	it('has one row per fact key recorded by at least one tool, with the localized label', () => {
		const view = buildCompareView(fixture(), ['f-uji', 'fair-enough'], 'en', TODAY);
		expect(view.rows.map((row) => row.key)).toEqual([
			'operator',
			'targets',
			'mode',
			'inputs',
			'frameworks',
			'output',
			'source_code',
			'license',
			'status'
		]);
		for (const row of view.rows) expect(row.label).toBe(FACT_LABELS.en[row.key]);
		const es = buildCompareView(fixture(), ['f-uji', 'fair-enough'], 'es', TODAY);
		for (const row of es.rows) expect(row.label).toBe(FACT_LABELS.es[row.key]);
	});

	it('has one cell per tool in column order, carrying the items of the tool view', () => {
		const content = fixture();
		const ids = ['fair-enough', 'f-uji'];
		const view = buildCompareView(content, ids, 'en', TODAY);
		for (const row of view.rows) {
			expect(row.cells.map((cell) => cell.toolId)).toEqual(ids);
		}
		const targets = view.rows.find((row) => row.key === 'targets')!;
		const fuji = buildToolView(content, 'f-uji', 'en', TODAY).facts.find(
			(fact) => fact.key === 'targets'
		)!;
		expect(targets.cells[1]).toEqual({ toolId: 'f-uji', missing: false, items: fuji.items });
		expect(targets.cells[0].items.map((item) => item.text)).toEqual(['Dataset', 'Software']);
	});

	it('marks a fact as missing, with no items, when a tool does not record it', () => {
		const view = buildCompareView(fixture(), ['f-uji', 'fair-enough'], 'en', TODAY);
		const frameworks = view.rows.find((row) => row.key === 'frameworks')!;
		expect(frameworks.cells[0].missing).toBe(false);
		expect(frameworks.cells[1]).toEqual({ toolId: 'fair-enough', missing: true, items: [] });
		const license = view.rows.find((row) => row.key === 'license')!;
		expect(license.cells.map((cell) => cell.missing)).toEqual([false, true]);
	});

	it('keeps operator links in the items', () => {
		const view = buildCompareView(fixture(), ['f-uji'], 'en', TODAY);
		const operator = view.rows.find((row) => row.key === 'operator')!;
		expect(operator.cells[0].items).toEqual([
			{ text: 'Example Operator A', href: 'https://example.org/operator-a' }
		]);
	});

	it('omits rows that no selected tool records', () => {
		const view = buildCompareView(fixture(), ['fair-enough'], 'en', TODAY);
		const keys = view.rows.map((row) => row.key);
		expect(keys).not.toContain('license');
		expect(keys).not.toContain('frameworks');
		expect(keys).not.toContain('source_code');
	});

	it('uses the content, so a mutated fixture changes the cells', () => {
		const files = mutate(loadFixtureFiles(), 'content/tools/fair-enough.yaml', (doc) => {
			doc.license = 'Apache-2.0';
		});
		const view = buildCompareView(
			loadContent(files, { today: TODAY }),
			['fair-enough'],
			'en',
			TODAY
		);
		const license = view.rows.find((row) => row.key === 'license')!;
		expect(license.cells[0]).toEqual({
			toolId: 'fair-enough',
			missing: false,
			items: [{ text: 'Apache-2.0' }]
		});
	});
});
