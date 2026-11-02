import { describe, expect, it } from 'vitest';
import { getContent, loadContent, type Content } from './content';
import { implementedBy, implementsFrameworks } from './framework-links';
import { loadFixtureFiles, mutate, type Files } from './__fixtures__/helpers';

const TODAY = new Date(2025, 5, 1);

const ids = (list: { id: string }[]) => list.map((item) => item.id);

/** Fixture content where `frameworks` of the given entries are replaced. */
function withFrameworks(frameworks: Record<string, string[]>): Content {
	let files: Files = loadFixtureFiles();
	for (const [id, value] of Object.entries(frameworks)) {
		files = mutate(files, `content/tools/${id}.yaml`, (doc) => {
			doc.frameworks = value;
		});
	}
	return loadContent(files, { today: TODAY });
}

describe('implementedBy', () => {
	it('lists the tools that share a framework id with the entry', () => {
		const content = withFrameworks({ 'fairsfair-metrics': ['fairsfair_metrics'] });
		expect(ids(implementedBy(content, 'fairsfair-metrics'))).toEqual(['f-uji']);
	});

	it('returns every sharing tool in home order', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['fairsfair_metrics'],
			'fair-enough': ['custom', 'fairsfair_metrics']
		});
		// Both tools are in the "datasets" section; content order puts f-uji first.
		expect(ids(implementedBy(content, 'fairsfair-metrics'))).toEqual(['f-uji', 'fair-enough']);
	});

	it('follows the order of the sections, not the order of the ids', () => {
		const files = mutate(
			mutate(loadFixtureFiles(), 'content/sections.yaml', (sections) => {
				sections.reverse();
			}),
			'content/tools/fairsfair-metrics.yaml',
			(doc) => {
				doc.frameworks = ['fairsfair_metrics'];
			}
		);
		const withTwo = mutate(files, 'content/tools/fair-enough.yaml', (doc) => {
			doc.section = 'directories';
			doc.frameworks = ['fairsfair_metrics'];
		});
		const content = loadContent(withTwo, { today: TODAY });
		// Sections reversed: directories (fair-enough) come before datasets (f-uji).
		expect(ids(implementedBy(content, 'fairsfair-metrics'))).toEqual(['fair-enough', 'f-uji']);
	});

	it('matches when the entry lists several ids and the tool shares only one', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['rda_fdmm', 'fairsfair_metrics']
		});
		expect(ids(implementedBy(content, 'fairsfair-metrics'))).toEqual(['f-uji']);
	});

	it('ignores the ids custom and other', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['custom', 'other'],
			'f-uji': ['custom', 'other'],
			'fair-enough': ['other']
		});
		expect(implementedBy(content, 'fairsfair-metrics')).toEqual([]);
	});

	it('returns an empty list when no tool shares an id', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['rda_fdmm'],
			'f-uji': ['fairsfair_metrics']
		});
		expect(implementedBy(content, 'fairsfair-metrics')).toEqual([]);
	});

	it('returns an empty list for an entry without framework ids', () => {
		expect(
			implementedBy(loadContent(loadFixtureFiles(), { today: TODAY }), 'fairsfair-metrics')
		).toEqual([]);
	});

	it('returns an empty list for an unknown id', () => {
		const content = withFrameworks({ 'fairsfair-metrics': ['fairsfair_metrics'] });
		expect(implementedBy(content, 'nope')).toEqual([]);
	});

	it('returns an empty list when the id is not a framework entry', () => {
		const content = withFrameworks({ 'fairsfair-metrics': ['fairsfair_metrics'] });
		expect(implementedBy(content, 'f-uji')).toEqual([]);
		expect(implementedBy(content, 'fair-catalogue')).toEqual([]);
	});

	it('lists only entries of kind tool', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['fairsfair_metrics'],
			'fair-catalogue': ['fairsfair_metrics']
		});
		expect(ids(implementedBy(content, 'fairsfair-metrics'))).toEqual(['f-uji']);
	});

	it('does not list the entry itself', () => {
		const content = withFrameworks({ 'fairsfair-metrics': ['fairsfair_metrics'] });
		expect(ids(implementedBy(content, 'fairsfair-metrics'))).not.toContain('fairsfair-metrics');
	});
});

describe('implementsFrameworks', () => {
	it('lists the framework entries that share a framework id with the tool', () => {
		const content = withFrameworks({ 'fairsfair-metrics': ['fairsfair_metrics'] });
		expect(ids(implementsFrameworks(content, 'f-uji'))).toEqual(['fairsfair-metrics']);
	});

	it('returns an empty list when the framework entry has no framework ids', () => {
		expect(
			implementsFrameworks(loadContent(loadFixtureFiles(), { today: TODAY }), 'f-uji')
		).toEqual([]);
	});

	it('returns every sharing framework entry in home order', () => {
		const files = loadFixtureFiles();
		const extra = mutate(
			{
				...files,
				'content/tools/second-metrics.yaml': files['content/tools/fairsfair-metrics.yaml']
			},
			'content/tools/second-metrics.yaml',
			(doc) => {
				doc.id = 'second-metrics';
				doc.frameworks = ['fairsfair_metrics'];
			}
		);
		const content = loadContent(
			mutate(extra, 'content/tools/fairsfair-metrics.yaml', (doc) => {
				doc.frameworks = ['fairsfair_metrics'];
			}),
			{ today: TODAY }
		);
		expect(ids(implementsFrameworks(content, 'f-uji'))).toEqual([
			'fairsfair-metrics',
			'second-metrics'
		]);
	});

	it('ignores the ids custom and other', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['custom', 'other'],
			'f-uji': ['custom', 'other'],
			'fair-enough': ['other']
		});
		expect(implementsFrameworks(content, 'f-uji')).toEqual([]);
		expect(implementsFrameworks(content, 'fair-enough')).toEqual([]);
	});

	it('returns an empty list for a tool without framework ids', () => {
		const content = withFrameworks({ 'fairsfair-metrics': ['fairsfair_metrics'] });
		expect(implementsFrameworks(content, 'fair-enough')).toEqual([]);
	});

	it('returns an empty list for an unknown id', () => {
		const content = withFrameworks({ 'fairsfair-metrics': ['fairsfair_metrics'] });
		expect(implementsFrameworks(content, 'nope')).toEqual([]);
	});

	it('returns an empty list when the id is not an entry of kind tool', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['fairsfair_metrics'],
			'fair-catalogue': ['fairsfair_metrics']
		});
		expect(implementsFrameworks(content, 'fairsfair-metrics')).toEqual([]);
		expect(implementsFrameworks(content, 'fair-catalogue')).toEqual([]);
	});

	it('is the inverse of implementedBy', () => {
		const content = withFrameworks({
			'fairsfair-metrics': ['fairsfair_metrics', 'rda_fdmm'],
			'fair-enough': ['rda_fdmm']
		});
		for (const tool of content.tools.filter((item) => item.kind === 'tool')) {
			for (const framework of implementsFrameworks(content, tool.id)) {
				expect(ids(implementedBy(content, framework.id))).toContain(tool.id);
			}
		}
	});
});

describe('framework links on the real content', () => {
	const real = () => getContent();

	it('links f-uji to the framework entries that use the same framework id', () => {
		const content = real();
		const fuji = content.tools.find((tool) => tool.id === 'f-uji')!;
		const shared = (fuji.frameworks ?? []).filter((id) => id !== 'custom' && id !== 'other');
		const expected = content.tools
			.filter((tool) => tool.kind === 'framework')
			.filter((tool) => (tool.frameworks ?? []).some((id) => shared.includes(id)))
			.map((tool) => tool.id)
			.sort();
		expect(shared.length).toBeGreaterThan(0);
		expect(expected.length).toBeGreaterThan(0);
		expect(ids(implementsFrameworks(content, 'f-uji')).sort()).toEqual(expected);
	});

	it('lists fair-eva under the RDA FAIR Data Maturity Model entry', () => {
		const content = real();
		expect(ids(implementedBy(content, 'rda-fair-data-maturity-model'))).toContain('fair-eva');
		expect(ids(implementsFrameworks(content, 'fair-eva'))).toContain(
			'rda-fair-data-maturity-model'
		);
	});

	it('gives no links for tools declared with custom or other only', () => {
		const content = real();
		expect(implementsFrameworks(content, 'fair-checker')).toEqual([]);
		expect(implementsFrameworks(content, 'fair-champion')).toEqual([]);
	});

	it('returns only entries of the right kind for every entry', () => {
		const content = real();
		for (const entry of content.tools) {
			if (entry.kind === 'framework') {
				for (const tool of implementedBy(content, entry.id)) expect(tool.kind).toBe('tool');
			} else {
				expect(implementedBy(content, entry.id)).toEqual([]);
			}
			if (entry.kind === 'tool') {
				for (const framework of implementsFrameworks(content, entry.id)) {
					expect(framework.kind).toBe('framework');
				}
			} else {
				expect(implementsFrameworks(content, entry.id)).toEqual([]);
			}
		}
	});
});
