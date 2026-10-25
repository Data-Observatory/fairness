import { describe, expect, it } from 'vitest';
import { getContent, loadContent, type Content } from './content';
import { filterTools } from './filter';
import { loadFixtureFiles, mutate } from './__fixtures__/helpers';
import { buildHomeView, buildToolView } from './view';

// The view model is plain data for the Svelte components: no Svelte, no DOM, no fetching.
// UI chrome words (labels of the definition list, filter group titles) come from Paraglide
// messages; everything that comes from content/*.yaml is already localized here.

const FIXTURE_TODAY = new Date(2025, 5, 1);

const fixture = (edit: (files: Record<string, string>) => Record<string, string> = (f) => f) =>
	loadContent(edit(loadFixtureFiles()), { today: FIXTURE_TODAY });

const withSite = (edit: (site: any) => void) => () =>
	fixture((files) => mutate(files, 'content/site.yaml', edit));

/** Local midnight `days` calendar days after the ISO date. */
function after(iso: string, days: number): Date {
	const [year, month, date] = iso.split('-').map(Number);
	return new Date(year, month - 1, date + days);
}

const allCards = (view: ReturnType<typeof buildHomeView>) => view.sections.flatMap((s) => s.tools);
const card = (view: ReturnType<typeof buildHomeView>, id: string) => {
	const found = allCards(view).find((item) => item.id === id);
	if (!found) throw new Error(`no card ${id}`);
	return found;
};

describe('buildHomeView: site texts per locale', () => {
	it('takes site name, tagline and caveats from the content in each locale', () => {
		const content = fixture();
		const en = buildHomeView(content, 'en', FIXTURE_TODAY);
		const es = buildHomeView(content, 'es', FIXTURE_TODAY);
		expect(en.siteName).toBe('FAIR Resources Finder');
		expect(es.siteName).toBe('Buscador de recursos FAIR');
		expect(en.tagline).toBe('Directory of external FAIR assessment resources');
		expect(es.tagline).toBe('Directorio de recursos externos de evaluación FAIR');
		expect(en.caveats).toEqual(content.caveats.map((item) => item.text.en));
		expect(es.caveats).toEqual(content.caveats.map((item) => item.text.es));
		expect(en.caveats).toHaveLength(3);
	});

	it('localizes section titles and intros', () => {
		const content = fixture();
		const en = buildHomeView(content, 'en', FIXTURE_TODAY);
		const es = buildHomeView(content, 'es', FIXTURE_TODAY);
		expect(en.sections[0].title).toBe('Dataset assessment tools');
		expect(es.sections[0].title).toBe('Herramientas de evaluación de conjuntos de datos');
		expect(en.sections[0].intro).toBe('Tools that assess datasets.');
		expect(es.sections[0].intro).toBe('Herramientas que evalúan conjuntos de datos.');
	});

	it('localizes card summaries and chip labels', () => {
		const content = fixture();
		const en = card(buildHomeView(content, 'en', FIXTURE_TODAY), 'f-uji');
		const es = card(buildHomeView(content, 'es', FIXTURE_TODAY), 'f-uji');
		expect(en.summary).toBe(
			'Automated assessment of a dataset identified by a persistent identifier.'
		);
		expect(es.summary).toBe(
			'Evaluación automática de un conjunto de datos identificado con un identificador persistente.'
		);
		expect(en.chips).toEqual([
			{ kind: 'mode', id: 'automated', label: 'Automated' },
			{ kind: 'target', id: 'dataset', label: 'Dataset' },
			{ kind: 'status', id: 'available', label: 'Available' }
		]);
		expect(es.chips).toEqual([
			{ kind: 'mode', id: 'automated', label: 'Automático' },
			{ kind: 'target', id: 'dataset', label: 'Conjunto de datos' },
			{ kind: 'status', id: 'available', label: 'Disponible' }
		]);
	});

	it('gives one target chip per target and a status chip for every entry', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		expect(card(view, 'fair-enough').chips.map((chip) => `${chip.kind}:${chip.id}`)).toEqual([
			'mode:automated',
			'target:dataset',
			'target:software',
			'status:available'
		]);
	});

	it('exposes the external url and its host on every card', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		const fuji = card(view, 'f-uji');
		expect(fuji.url).toBe('https://example.org/f-uji');
		expect(fuji.host).toBe('example.org');
		expect(fuji.name).toBe('F-UJI');
	});
});

describe('buildHomeView: sections', () => {
	it('keeps the order of sections.yaml and the collapsed flag', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		expect(view.sections.map((s) => [s.id, s.collapsed])).toEqual([
			['datasets', false],
			['frameworks', false],
			['directories', true]
		]);
	});

	it('follows a reordered sections.yaml', () => {
		const content = fixture((files) =>
			mutate(files, 'content/sections.yaml', (doc: any[]) => doc.reverse())
		);
		const view = buildHomeView(content, 'en', FIXTURE_TODAY);
		expect(view.sections.map((s) => s.id)).toEqual(['directories', 'frameworks', 'datasets']);
	});

	it('puts each tool in its own section, sorted by id, and no tool twice', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		expect(view.sections.map((s) => s.tools.map((t) => t.id))).toEqual([
			['f-uji', 'fair-enough'],
			['fairsfair-metrics'],
			['fair-catalogue']
		]);
	});

	it('renders frameworks and directories without tool-only fields', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		const framework = card(view, 'fairsfair-metrics');
		const directory = card(view, 'fair-catalogue');
		for (const entry of [framework, directory]) {
			expect(entry.chips.map((chip) => chip.kind)).toEqual(['status']);
			expect(entry.bestFor).toBeUndefined();
			expect(entry.summary.length).toBeGreaterThan(0);
		}
		expect(directory.chips[0]).toEqual({ kind: 'status', id: 'unverified', label: 'Unverified' });
	});
});

describe('buildHomeView: best for', () => {
	it('is the localized best_for text when the feature is on', () => {
		const content = fixture();
		expect(card(buildHomeView(content, 'en', FIXTURE_TODAY), 'f-uji').bestFor).toBe(
			'Assessing a published dataset that has a DOI.'
		);
		expect(card(buildHomeView(content, 'es', FIXTURE_TODAY), 'f-uji').bestFor).toBe(
			'Evaluar un conjunto de datos publicado que tiene un DOI.'
		);
	});

	it('is undefined for a tool without best_for', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		expect(card(view, 'fair-enough').bestFor).toBeUndefined();
	});

	it('is undefined on every card when features.bestFor is false', () => {
		const content = withSite((site) => {
			site.features.bestFor = false;
		})();
		for (const locale of ['en', 'es'] as const) {
			const view = buildHomeView(content, locale, FIXTURE_TODAY);
			expect(allCards(view).map((c) => c.bestFor)).toEqual([
				undefined,
				undefined,
				undefined,
				undefined
			]);
		}
	});

	it('is also hidden on the detail page when features.bestFor is false', () => {
		const content = withSite((site) => {
			site.features.bestFor = false;
		})();
		expect(buildToolView(content, 'f-uji', 'en', FIXTURE_TODAY).bestFor).toBeUndefined();
		expect(buildToolView(fixture(), 'f-uji', 'en', FIXTURE_TODAY).bestFor).toBe(
			'Assessing a published dataset that has a DOI.'
		);
	});
});

describe('buildHomeView: filter groups', () => {
	it('lists the groups of taxonomy.filters in order, each with a label and all taxonomy options', () => {
		const content = fixture();
		const view = buildHomeView(content, 'en', FIXTURE_TODAY);
		expect(view.filterGroups.map((g) => g.id)).toEqual([
			'target',
			'mode',
			'input',
			'framework',
			'status'
		]);
		for (const group of view.filterGroups) {
			expect(group.label.length).toBeGreaterThan(0);
		}
		const target = view.filterGroups.find((g) => g.id === 'target')!;
		expect(target.options.map((o) => o.id)).toEqual(content.taxonomy.target.map((o) => o.id));
		expect(target.options[0]).toEqual({ id: 'dataset', label: 'Dataset', count: 2 });
	});

	it('only lists groups present in taxonomy.filters, in that order', () => {
		const content = fixture((files) =>
			mutate(files, 'content/taxonomy.yaml', (doc) => {
				doc.filters = ['mode', 'target'];
			})
		);
		const view = buildHomeView(content, 'en', FIXTURE_TODAY);
		expect(view.filterGroups.map((g) => g.id)).toEqual(['mode', 'target']);
	});

	it('localizes option labels', () => {
		const view = buildHomeView(fixture(), 'es', FIXTURE_TODAY);
		const mode = view.filterGroups.find((g) => g.id === 'mode')!;
		expect(mode.options.map((o) => o.label)).toEqual(['Automático', 'Manual', 'Híbrido']);
	});

	it('omits the status group when features.statusFilter is false', () => {
		const content = withSite((site) => {
			site.features.statusFilter = false;
		})();
		const view = buildHomeView(content, 'en', FIXTURE_TODAY);
		expect(view.filterGroups.map((g) => g.id)).toEqual(['target', 'mode', 'input', 'framework']);
	});

	it('keeps the status group when features.statusFilter is true', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		expect(view.filterGroups.map((g) => g.id)).toContain('status');
	});

	it('counts the tools that match each option (fixture, explicit values)', () => {
		const view = buildHomeView(fixture(), 'en', FIXTURE_TODAY);
		const counts = (id: string) =>
			Object.fromEntries(
				view.filterGroups.find((g) => g.id === id)!.options.map((o) => [o.id, o.count])
			);
		expect(counts('mode')).toEqual({ automated: 2, manual: 0, hybrid: 0 });
		expect(counts('target')).toMatchObject({ dataset: 2, software: 1, ontology: 0 });
		expect(counts('input')).toMatchObject({
			doi: 2,
			landing_page_url: 1,
			metadata_url: 1,
			none: 0
		});
		expect(counts('framework')).toMatchObject({ fairsfair_metrics: 1, rda_fdmm: 0 });
		expect(counts('status')).toEqual({ available: 3, limited: 0, discontinued: 0, unverified: 1 });
	});

	it('counts equal the number of tools filterTools selects for that option alone', () => {
		for (const content of [fixture(), getContent()]) {
			const view = buildHomeView(content, 'en', new Date(2026, 9, 25));
			for (const group of view.filterGroups) {
				for (const option of group.options) {
					const expected = filterTools(content.tools, { [group.id]: [option.id] }).length;
					expect(option.count, `${group.id}=${option.id}`).toBe(expected);
				}
			}
		}
	});
});

describe('buildHomeView: finder table', () => {
	it('is null when features.finderTable is false', () => {
		const content = withSite((site) => {
			site.features.finderTable = false;
		})();
		expect(buildHomeView(content, 'en', FIXTURE_TODAY).finder).toBeNull();
	});

	it('has one row per finder.yaml row, in order, with localized input label, note and tool names', () => {
		const content = fixture();
		const en = buildHomeView(content, 'en', FIXTURE_TODAY).finder!;
		const es = buildHomeView(content, 'es', FIXTURE_TODAY).finder!;
		expect(en.map((row) => row.inputId)).toEqual(['doi', 'landing_page_url', 'metadata_url']);
		expect(en.map((row) => row.inputLabel)).toEqual(['DOI', 'Landing page URL', 'Metadata URL']);
		expect(es.map((row) => row.inputLabel)).toEqual([
			'DOI',
			'URL de la página de destino',
			'URL de metadatos'
		]);
		expect(en[0].tools).toEqual([
			{ id: 'f-uji', name: 'F-UJI' },
			{ id: 'fair-enough', name: 'FAIR Enough' }
		]);
		expect(en[2].note).toBe('Requires a public metadata document.');
		expect(es[2].note).toBe('Requiere un documento de metadatos público.');
	});

	it('leaves note undefined when the row has none', () => {
		const rows = buildHomeView(fixture(), 'en', FIXTURE_TODAY).finder!;
		expect(rows[0].note).toBeUndefined();
	});
});

describe('stale flag', () => {
	const staleOf = (content: Content, today: Date) =>
		card(buildHomeView(content, 'en', today), 'f-uji').stale;
	const content = fixture((files) =>
		mutate(files, 'content/tools/f-uji.yaml', (doc) => {
			doc.last_verified = '2025-01-15';
		})
	);

	it('is false exactly staleAfterDays days after last_verified and true one day later', () => {
		expect(staleOf(content, after('2025-01-15', 0))).toBe(false);
		expect(staleOf(content, after('2025-01-15', 180))).toBe(false);
		expect(staleOf(content, after('2025-01-15', 181))).toBe(true);
	});

	it('reads the threshold from site.verification.staleAfterDays', () => {
		const short = fixture((files) =>
			mutate(
				mutate(files, 'content/site.yaml', (doc) => {
					doc.verification.staleAfterDays = 10;
				}),
				'content/tools/f-uji.yaml',
				(doc) => {
					doc.last_verified = '2025-01-15';
				}
			)
		);
		expect(staleOf(short, after('2025-01-15', 10))).toBe(false);
		expect(staleOf(short, after('2025-01-15', 11))).toBe(true);
	});

	it('applies to every entry kind', () => {
		const view = buildHomeView(content, 'en', after('2025-01-15', 400));
		expect(allCards(view).every((c) => c.stale)).toBe(true);
	});
});

describe('buildToolView', () => {
	const today = after('2025-01-15', 30);

	it('describes a complete tool with localized values', () => {
		const content = fixture();
		const en = buildToolView(content, 'f-uji', 'en', today);
		expect(en).toMatchObject({
			id: 'f-uji',
			kind: 'tool',
			name: 'F-UJI',
			summary: 'Automated assessment of a dataset identified by a persistent identifier.',
			bestFor: 'Assessing a published dataset that has a DOI.',
			url: 'https://example.org/f-uji',
			host: 'example.org',
			lastVerified: '2025-01-15',
			stale: false,
			daysSinceVerified: 30,
			statusNote: 'Responded on the verification date.'
		});
		expect(en.chips).toEqual([
			{ kind: 'mode', id: 'automated', label: 'Automated' },
			{ kind: 'target', id: 'dataset', label: 'Dataset' },
			{ kind: 'status', id: 'available', label: 'Available' }
		]);
		const es = buildToolView(content, 'f-uji', 'es', today);
		expect(es.summary).toBe(
			'Evaluación automática de un conjunto de datos identificado con un identificador persistente.'
		);
		expect(es.statusNote).toBe('Respondió en la fecha de verificación.');
		expect(es.chips[0].label).toBe('Automático');
	});

	it('lists facts with localized text, in a fixed order, only for fields that exist', () => {
		const content = fixture();
		const text = (view: ReturnType<typeof buildToolView>) =>
			view.facts.map((fact) => [fact.key, fact.items.map((item) => item.text)]);
		expect(text(buildToolView(content, 'f-uji', 'en', today))).toEqual([
			['operator', ['Example Operator A']],
			['targets', ['Dataset']],
			['mode', ['Automated']],
			['inputs', ['DOI', 'Landing page URL']],
			['frameworks', ['FAIRsFAIR metrics']],
			['output', ['Score per metric and a JSON report.']],
			['source_code', ['https://example.org/f-uji/source']],
			['license', ['MIT']],
			['status', ['Available']]
		]);
		expect(text(buildToolView(content, 'f-uji', 'es', today)).slice(1, 5)).toEqual([
			['targets', ['Conjunto de datos']],
			['mode', ['Automático']],
			['inputs', ['DOI', 'URL de la página de destino']],
			['frameworks', ['Métricas FAIRsFAIR']]
		]);
	});

	it('links the operator and source code, and exposes api and self-hosting as plain data', () => {
		const view = buildToolView(fixture(), 'f-uji', 'en', today);
		const fact = (key: string) => view.facts.find((item) => item.key === key)!;
		expect(fact('operator').items[0].href).toBe('https://example.org/operator-a');
		expect(fact('source_code').items[0].href).toBe('https://example.org/f-uji/source');
		expect(view.api).toEqual({ available: true, url: 'https://example.org/f-uji/api' });
		expect(view.selfHostable).toBe(true);
	});

	it('lists references with title, url and host', () => {
		const view = buildToolView(fixture(), 'f-uji', 'en', today);
		expect(view.references).toEqual([
			{ title: 'Example paper', url: 'https://example.org/paper', host: 'example.org' }
		]);
	});

	it('omits facts, api, self-hosting, status note and best for that the tool does not have', () => {
		const view = buildToolView(fixture(), 'fair-enough', 'en', today);
		expect(view.facts.map((fact) => fact.key)).toEqual([
			'operator',
			'targets',
			'mode',
			'inputs',
			'output',
			'status'
		]);
		expect(view.facts.find((fact) => fact.key === 'operator')!.items[0].href).toBeUndefined();
		expect(view.api).toBeUndefined();
		expect(view.selfHostable).toBeUndefined();
		expect(view.statusNote).toBeUndefined();
		expect(view.bestFor).toBeUndefined();
		expect(view.references).toEqual([]);
	});

	it('renders a framework and a directory without tool-only facts', () => {
		const content = fixture();
		const framework = buildToolView(content, 'fairsfair-metrics', 'en', today);
		const directory = buildToolView(content, 'fair-catalogue', 'es', today);
		for (const view of [framework, directory]) {
			expect(view.facts.map((fact) => fact.key)).toEqual(['operator', 'status']);
			expect(view.chips.map((chip) => chip.kind)).toEqual(['status']);
		}
		expect(framework.kind).toBe('framework');
		expect(directory.kind).toBe('directory');
		expect(directory.statusNote).toBe('No se abrió en la fecha de verificación.');
		expect(directory.chips[0].label).toBe('Sin verificar');
	});

	it('flags stale at the staleAfterDays boundary and reports the day count', () => {
		const content = fixture();
		const at180 = buildToolView(content, 'f-uji', 'en', after('2025-01-15', 180));
		const at181 = buildToolView(content, 'f-uji', 'en', after('2025-01-15', 181));
		expect([at180.stale, at180.daysSinceVerified]).toEqual([false, 180]);
		expect([at181.stale, at181.daysSinceVerified]).toEqual([true, 181]);
	});

	it('throws for an unknown tool id, naming it', () => {
		expect(() => buildToolView(fixture(), 'no-such-tool', 'en', today)).toThrow(/no-such-tool/);
	});
});

describe('real content', () => {
	const content = getContent();
	const today = new Date(2026, 9, 25);

	it('builds the home view in both locales with every tool on exactly one card', () => {
		for (const locale of ['en', 'es'] as const) {
			const view = buildHomeView(content, locale, today);
			const ids = allCards(view).map((c) => c.id);
			expect(ids).toHaveLength(content.tools.length);
			expect(new Set(ids).size).toBe(content.tools.length);
			expect(view.sections.map((s) => s.id)).toEqual([
				'datasets',
				'other-objects',
				'frameworks',
				'directories'
			]);
			expect(view.sections.map((s) => s.collapsed)).toEqual([false, true, false, false]);
			for (const c of allCards(view)) {
				expect(c.url.startsWith('https://')).toBe(true);
				expect(c.host.length).toBeGreaterThan(0);
				expect(c.summary.length).toBeGreaterThan(0);
				expect(c.chips.at(-1)!.kind).toBe('status');
			}
			expect(view.finder).not.toBeNull();
			expect(view.caveats).toHaveLength(content.caveats.length);
		}
	});

	it('uses different texts in en and es', () => {
		const en = buildHomeView(content, 'en', today);
		const es = buildHomeView(content, 'es', today);
		expect(en.siteName).not.toBe(es.siteName);
		expect(en.sections[0].title).not.toBe(es.sections[0].title);
		expect(card(en, 'f-uji').summary).not.toBe(card(es, 'f-uji').summary);
	});

	it('builds a detail view for every tool in both locales', () => {
		for (const locale of ['en', 'es'] as const) {
			for (const tool of content.tools) {
				const view = buildToolView(content, tool.id, locale, today);
				expect(view.url).toBe(tool.url);
				expect(view.lastVerified).toBe(tool.last_verified);
				expect(view.facts.some((fact) => fact.key === 'status')).toBe(true);
				if (tool.kind !== 'tool') {
					expect(view.facts.some((fact) => fact.key === 'targets' || fact.key === 'mode')).toBe(
						false
					);
				}
			}
		}
	});

	it('shows best for only on tools that have it', () => {
		const view = buildHomeView(content, 'en', today);
		for (const tool of content.tools) {
			expect(card(view, tool.id).bestFor !== undefined).toBe(tool.best_for !== undefined);
		}
	});

	it('marks nothing stale on the verification day and everything stale a year later', () => {
		expect(allCards(buildHomeView(content, 'en', today)).some((c) => c.stale)).toBe(false);
		const later = new Date(2027, 9, 25);
		expect(allCards(buildHomeView(content, 'en', later)).every((c) => c.stale)).toBe(true);
	});
});

type WithShortName = ReturnType<typeof buildHomeView> & { shortName: string };
type WithFilterFields = ReturnType<typeof buildHomeView>['sections'][number]['tools'][number] & {
	filterFields: Record<string, string[]>;
};

describe('buildHomeView: shortName', () => {
	const withShortName = withSite((site) => {
		site.shortName = { en: 'FAIR Finder', es: 'Buscador FAIR' };
	});

	it('returns the localized shortName from site.yaml', () => {
		const content = withShortName();
		expect((buildHomeView(content, 'en', FIXTURE_TODAY) as WithShortName).shortName).toBe(
			'FAIR Finder'
		);
		expect((buildHomeView(content, 'es', FIXTURE_TODAY) as WithShortName).shortName).toBe(
			'Buscador FAIR'
		);
	});

	it('falls back to siteName when site.yaml has no shortName', () => {
		const content = fixture();
		for (const locale of ['en', 'es'] as const) {
			const view = buildHomeView(content, locale, FIXTURE_TODAY) as WithShortName;
			expect(view.shortName).toBe(view.siteName);
		}
	});
});

describe('ToolCard.filterFields', () => {
	const fields = (id: string) =>
		(card(buildHomeView(fixture(), 'en', FIXTURE_TODAY), id) as WithFilterFields).filterFields;

	it('exposes the tool target, mode, input, framework and status ids', () => {
		expect(fields('f-uji')).toEqual({
			target: ['dataset'],
			mode: ['automated'],
			input: ['doi', 'landing_page_url'],
			framework: ['fairsfair_metrics'],
			status: ['available']
		});
	});

	it('has all five groups, empty where an entry lacks the field', () => {
		expect(fields('fairsfair-metrics')).toEqual({
			target: [],
			mode: [],
			input: [],
			framework: [],
			status: ['available']
		});
	});

	it('is the same in every locale (ids, not labels)', () => {
		const content = fixture();
		const en = card(buildHomeView(content, 'en', FIXTURE_TODAY), 'fair-enough');
		const es = card(buildHomeView(content, 'es', FIXTURE_TODAY), 'fair-enough');
		expect((en as WithFilterFields).filterFields).toEqual((es as WithFilterFields).filterFields);
	});

	it('is enough to reproduce filterTools without the content', () => {
		const content = fixture();
		const cards = allCards(buildHomeView(content, 'en', FIXTURE_TODAY)) as WithFilterFields[];
		const selections = [
			{ mode: ['automated'] },
			{ target: ['dataset', 'software'], mode: ['automated'] },
			{ status: ['unverified'] },
			{ framework: ['fairsfair_metrics'], input: ['doi'] },
			{ target: ['ontology'] }
		];
		for (const selection of selections) {
			const viaFields = cards
				.filter((entry) =>
					Object.entries(selection).every(([group, wanted]) =>
						entry.filterFields[group].some((value) => wanted.includes(value))
					)
				)
				.map((entry) => entry.id)
				.sort();
			const viaContent = filterTools(content.tools, selection)
				.map((tool) => tool.id)
				.sort();
			expect(viaFields, JSON.stringify(selection)).toEqual(viaContent);
		}
	});
});
