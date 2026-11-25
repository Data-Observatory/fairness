import { describe, expect, it } from 'vitest';
import { loadContent, type Content } from './content';
import { buildCompareView } from './compare';
import { FACT_LABELS } from './labels';
import { hasMetricRows, METRIC_FACT_KEYS, metricsSources } from './metrics';
import { loadFixtureFiles, mutate } from './__fixtures__/helpers';
import { buildToolView } from './view';

// Metrics are recorded facts (citations, GitHub activity, downloads) shown on the detail page and
// in the comparison. They are never ranked, scored or sorted.

const TODAY = new Date(2025, 5, 1);

type Edit = (metrics: any) => void;

const FULL = () => ({
	checked: '2025-01-15',
	citations: [
		{ label: 'Patterns, 2021', doi: '10.1016/j.patter.2021.100370', count: 110 },
		{ label: 'Zenodo, 2020', doi: '10.5281/zenodo.15045911', count: 1 }
	],
	github: {
		stars: 82,
		forks: 1,
		contributors: 1234,
		last_push: '2025-01-10',
		last_release: { tag: 'v4.0.1', date: '2025-01-05' }
	},
	downloads: [
		{ source: 'zenodo', count: 17372, period: 'total' },
		{ source: 'pypi', count: 2114, period: 'last_30_days' }
	]
});

function content(edit: Edit = () => {}, id = 'f-uji'): Content {
	const files = mutate(loadFixtureFiles(), `content/tools/${id}.yaml`, (tool) => {
		tool.source_code = 'https://github.com/example-org/example';
		tool.metrics = FULL();
		edit(tool.metrics);
	});
	return loadContent(files, { today: TODAY });
}

const fact = (view: ReturnType<typeof buildToolView>, key: string) =>
	view.facts.find((item) => item.key === key);
const texts = (view: ReturnType<typeof buildToolView>, key: string) =>
	fact(view, key)?.items.map((item) => item.text);

describe('metric labels', () => {
	it.each(['en', 'es'] as const)('%s labels exist for the three metric facts', (locale) => {
		for (const key of METRIC_FACT_KEYS) expect(FACT_LABELS[locale][key]).toBeTruthy();
	});

	it('uses the agreed names', () => {
		expect([FACT_LABELS.en.citations, FACT_LABELS.en.github, FACT_LABELS.en.downloads]).toEqual([
			'Citations',
			'GitHub activity',
			'Downloads'
		]);
		expect([FACT_LABELS.es.citations, FACT_LABELS.es.github, FACT_LABELS.es.downloads]).toEqual([
			'Citas',
			'Actividad en GitHub',
			'Descargas'
		]);
	});

	it('places the metric facts after license and before status', () => {
		const order = Object.keys(FACT_LABELS.en);
		const [license, status] = [order.indexOf('license'), order.indexOf('status')];
		for (const key of METRIC_FACT_KEYS) {
			expect(order.indexOf(key)).toBeGreaterThan(license);
			expect(order.indexOf(key)).toBeLessThan(status);
		}
		expect([...METRIC_FACT_KEYS]).toEqual(['citations', 'github', 'downloads']);
	});
});

describe('buildToolView: metric facts', () => {
	it('lists citations, one item per work, with the count and the label', () => {
		const view = buildToolView(content(), 'f-uji', 'en', TODAY);
		expect(texts(view, 'citations')).toEqual(['110 (Patterns, 2021)', '1 (Zenodo, 2020)']);
	});

	it('links every citation to its DOI', () => {
		const view = buildToolView(content(), 'f-uji', 'en', TODAY);
		expect(fact(view, 'citations')!.items.map((item) => item.href)).toEqual([
			'https://doi.org/10.1016/j.patter.2021.100370',
			'https://doi.org/10.5281/zenodo.15045911'
		]);
	});

	it('lists GitHub numbers in English with plural and singular forms', () => {
		const view = buildToolView(content(), 'f-uji', 'en', TODAY);
		expect(texts(view, 'github')).toEqual([
			'82 stars',
			'1 fork',
			'1,234 contributors',
			'last push 2025-01-10',
			'latest release v4.0.1 (2025-01-05)'
		]);
		const one = buildToolView(
			content((m) => {
				m.github.stars = 1;
				m.github.forks = 2;
				m.github.contributors = 1;
			}),
			'f-uji',
			'en',
			TODAY
		);
		expect(texts(one, 'github')!.slice(0, 3)).toEqual(['1 star', '2 forks', '1 contributor']);
	});

	it('lists GitHub numbers in Spanish with plural and singular forms', () => {
		const view = buildToolView(content(), 'f-uji', 'es', TODAY);
		expect(texts(view, 'github')).toEqual([
			'82 estrellas',
			'1 fork',
			'1.234 colaboradores',
			'último push 2025-01-10',
			'última versión v4.0.1 (2025-01-05)'
		]);
		const one = buildToolView(
			content((m) => {
				m.github.stars = 1;
				m.github.forks = 2;
				m.github.contributors = 1;
			}),
			'f-uji',
			'es',
			TODAY
		);
		expect(texts(one, 'github')!.slice(0, 3)).toEqual(['1 estrella', '2 forks', '1 colaborador']);
	});

	it('omits the release item when the entry has no recorded release', () => {
		const view = buildToolView(
			content((m) => delete m.github.last_release),
			'f-uji',
			'en',
			TODAY
		);
		expect(texts(view, 'github')).toEqual([
			'82 stars',
			'1 fork',
			'1,234 contributors',
			'last push 2025-01-10'
		]);
	});

	it('lists downloads with the source and the period, numbers formatted per locale', () => {
		const en = buildToolView(content(), 'f-uji', 'en', TODAY);
		expect(texts(en, 'downloads')).toEqual([
			'17,372 downloads on Zenodo (total)',
			'2,114 downloads on PyPI (last 30 days)'
		]);
		const es = buildToolView(content(), 'f-uji', 'es', TODAY);
		expect(texts(es, 'downloads')).toEqual([
			'17.372 descargas en Zenodo (total)',
			'2.114 descargas en PyPI (últimos 30 días)'
		]);
	});

	it('uses the singular for one download', () => {
		const view = buildToolView(
			content((m) => (m.downloads = [{ source: 'pypi', count: 1, period: 'total' }])),
			'f-uji',
			'en',
			TODAY
		);
		expect(texts(view, 'downloads')).toEqual(['1 download on PyPI (total)']);
	});

	it('keeps the facts in the fixed order: metrics after license, before status', () => {
		const view = buildToolView(content(), 'f-uji', 'en', TODAY);
		expect(view.facts.map((item) => item.key)).toEqual([
			'operator',
			'targets',
			'mode',
			'inputs',
			'frameworks',
			'output',
			'source_code',
			'license',
			'citations',
			'github',
			'downloads',
			'status'
		]);
		expect(fact(view, 'citations')!.label).toBe('Citations');
		expect(fact(buildToolView(content(), 'f-uji', 'es', TODAY), 'github')!.label).toBe(
			'Actividad en GitHub'
		);
	});

	it('shows only the metric facts that were recorded', () => {
		const view = buildToolView(
			content((m) => {
				delete m.github;
				delete m.downloads;
			}),
			'f-uji',
			'en',
			TODAY
		);
		expect(fact(view, 'citations')).toBeDefined();
		expect(fact(view, 'github')).toBeUndefined();
		expect(fact(view, 'downloads')).toBeUndefined();
	});

	it('adds no metric fact and no metrics data to an entry without metrics', () => {
		const plain = loadContent(loadFixtureFiles(), { today: TODAY });
		const view = buildToolView(plain, 'f-uji', 'en', TODAY);
		for (const key of METRIC_FACT_KEYS) expect(fact(view, key)).toBeUndefined();
		expect(view.metrics).toBeUndefined();
	});

	it('keeps the order of the recorded lists as written (no sorting by number)', () => {
		const view = buildToolView(
			content((m) => {
				m.citations = [
					{ label: 'A', doi: '10.1000/a', count: 1 },
					{ label: 'B', doi: '10.1000/b', count: 99 },
					{ label: 'C', doi: '10.1000/c', count: 5 }
				];
			}),
			'f-uji',
			'en',
			TODAY
		);
		expect(texts(view, 'citations')).toEqual(['1 (A)', '99 (B)', '5 (C)']);
	});
});

describe('buildToolView: metrics note data', () => {
	it('exposes the check date and the distinct sources, in a fixed order', () => {
		const view = buildToolView(content(), 'f-uji', 'en', TODAY);
		expect(view.metrics).toEqual({
			checked: '2025-01-15',
			sources: ['OpenAlex', 'GitHub', 'Zenodo', 'PyPI']
		});
	});

	it('lists only the sources behind the recorded numbers', () => {
		const view = buildToolView(
			content((m) => {
				delete m.citations;
				m.downloads = [
					{ source: 'pypi', count: 3, period: 'last_30_days' },
					{ source: 'pypi', count: 4, period: 'total' }
				];
			}),
			'f-uji',
			'en',
			TODAY
		);
		expect(view.metrics!.sources).toEqual(['GitHub', 'PyPI']);
	});

	it('metricsSources derives the names from a metrics block', () => {
		expect(metricsSources({ checked: '2025-01-15', citations: FULL().citations })).toEqual([
			'OpenAlex'
		]);
	});
});

describe('comparison rows', () => {
	const two = () => {
		const files = mutate(loadFixtureFiles(), 'content/tools/f-uji.yaml', (tool) => {
			tool.source_code = 'https://github.com/example-org/example';
			tool.metrics = FULL();
		});
		return loadContent(files, { today: TODAY });
	};

	it('adds the metric rows when a selected tool records them, "missing" for the others', () => {
		const view = buildCompareView(two(), ['f-uji', 'fair-enough'], 'en', TODAY);
		const keys = view.rows.map((row) => row.key);
		expect(keys).toEqual([
			'operator',
			'targets',
			'mode',
			'inputs',
			'frameworks',
			'output',
			'source_code',
			'license',
			'citations',
			'github',
			'downloads',
			'status'
		]);
		const citations = view.rows.find((row) => row.key === 'citations')!;
		expect(citations.cells[0].missing).toBe(false);
		expect(citations.cells[0].items[0].text).toBe('110 (Patterns, 2021)');
		expect(citations.cells[1]).toEqual({ toolId: 'fair-enough', missing: true, items: [] });
		expect(citations.label).toBe('Citations');
		expect(hasMetricRows(view.rows)).toBe(true);
	});

	it('has no metric row when no selected tool records metrics', () => {
		const plain = loadContent(loadFixtureFiles(), { today: TODAY });
		const view = buildCompareView(plain, ['f-uji', 'fair-enough'], 'en', TODAY);
		expect(view.rows.some((row) => (METRIC_FACT_KEYS as readonly string[]).includes(row.key))).toBe(
			false
		);
		expect(hasMetricRows(view.rows)).toBe(false);
	});

	it('has no metric row for the selected tools that have none, even if others do', () => {
		const view = buildCompareView(two(), ['fair-enough'], 'es', TODAY);
		expect(hasMetricRows(view.rows)).toBe(false);
	});
});
