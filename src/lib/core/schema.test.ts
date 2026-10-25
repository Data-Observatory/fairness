import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
	caveatsSchema,
	finderSchema,
	sectionsSchema,
	siteSchema,
	taxonomySchema,
	toolSchema
} from './schema';
import { loadFixtureFiles } from './__fixtures__/helpers';

const files = loadFixtureFiles();
const doc = (path: string) => parse(files[path]);
const clone = <T>(value: T): T => structuredClone(value);
const paths = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
	(result.error?.issues ?? []).map((issue) => issue.path.join('.'));

describe('valid fixtures parse', () => {
	it.each([
		['site', siteSchema, 'content/site.yaml'],
		['taxonomy', taxonomySchema, 'content/taxonomy.yaml'],
		['sections', sectionsSchema, 'content/sections.yaml'],
		['finder', finderSchema, 'content/finder.yaml'],
		['caveats', caveatsSchema, 'content/caveats.yaml'],
		['tool', toolSchema, 'content/tools/f-uji.yaml'],
		['fair-enough tool', toolSchema, 'content/tools/fair-enough.yaml'],
		['framework entry', toolSchema, 'content/tools/fairsfair-metrics.yaml'],
		['directory entry', toolSchema, 'content/tools/fair-catalogue.yaml']
	])('%s', (_name, schema, path) => {
		expect(schema.safeParse(doc(path)).success).toBe(true);
	});

	it('keeps last_verified as a plain string', () => {
		const tool = toolSchema.parse(doc('content/tools/f-uji.yaml'));
		expect(tool.last_verified).toBe('2025-01-15');
	});
});

describe('siteSchema', () => {
	const required = [
		'name',
		'tagline',
		'domain',
		'repository',
		'contributeUrl',
		'locales',
		'defaultLocale',
		'features',
		'verification',
		'style'
	];
	it.each(required)('missing %s fails with that path', (key) => {
		const site = clone(doc('content/site.yaml'));
		delete site[key];
		const result = siteSchema.safeParse(site);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain(key);
	});

	it('contactEmail is optional', () => {
		const site = clone(doc('content/site.yaml'));
		delete site.contactEmail;
		expect(siteSchema.safeParse(site).success).toBe(true);
	});

	it('rejects unknown keys at the top level and nested', () => {
		const top = clone(doc('content/site.yaml'));
		top.bogus = 1;
		expect(siteSchema.safeParse(top).success).toBe(false);
		const nested = clone(doc('content/site.yaml'));
		nested.features.bogus = true;
		expect(siteSchema.safeParse(nested).success).toBe(false);
		const style = clone(doc('content/site.yaml'));
		style.style.bogus = [];
		expect(siteSchema.safeParse(style).success).toBe(false);
	});

	it('rejects a localized field without es', () => {
		const site = clone(doc('content/site.yaml'));
		delete site.name.es;
		const result = siteSchema.safeParse(site);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain('name.es');
	});

	it('rejects an unknown forbidden character name', () => {
		const site = clone(doc('content/site.yaml'));
		site.style.forbiddenCharacters = ['em_dash', 'tilde'];
		expect(siteSchema.safeParse(site).success).toBe(false);
	});

	it('requires staleAfterDays to be a positive integer', () => {
		for (const bad of [0, -1, 1.5, '180']) {
			const site = clone(doc('content/site.yaml'));
			site.verification.staleAfterDays = bad;
			expect(siteSchema.safeParse(site).success, String(bad)).toBe(false);
		}
	});
});

describe('taxonomySchema', () => {
	it.each(['filters', 'target', 'mode', 'input', 'framework', 'status'])(
		'missing %s fails with that path',
		(key) => {
			const taxonomy = clone(doc('content/taxonomy.yaml'));
			delete taxonomy[key];
			const result = taxonomySchema.safeParse(taxonomy);
			expect(result.success).toBe(false);
			expect(paths(result)).toContain(key);
		}
	);

	it('rejects a value without es label', () => {
		const taxonomy = clone(doc('content/taxonomy.yaml'));
		delete taxonomy.target[0].label.es;
		const result = taxonomySchema.safeParse(taxonomy);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain('target.0.label.es');
	});

	it('rejects unknown keys on a value and on the document', () => {
		const value = clone(doc('content/taxonomy.yaml'));
		value.mode[0].bogus = 1;
		expect(taxonomySchema.safeParse(value).success).toBe(false);
		const top = clone(doc('content/taxonomy.yaml'));
		top.bogus = [];
		expect(taxonomySchema.safeParse(top).success).toBe(false);
	});

	it('description is optional but, when present, needs both locales', () => {
		const taxonomy = clone(doc('content/taxonomy.yaml'));
		taxonomy.mode[2].description = { en: 'only english' };
		const result = taxonomySchema.safeParse(taxonomy);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain('mode.2.description.es');
	});
});

describe('sectionsSchema', () => {
	it.each(['id', 'title'])('missing %s fails with that path', (key) => {
		const sections = clone(doc('content/sections.yaml'));
		delete sections[0][key];
		const result = sectionsSchema.safeParse(sections);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain(`0.${key}`);
	});

	it('rejects unknown keys and a title without es', () => {
		const unknown = clone(doc('content/sections.yaml'));
		unknown[0].bogus = 1;
		expect(sectionsSchema.safeParse(unknown).success).toBe(false);
		const missing = clone(doc('content/sections.yaml'));
		delete missing[1].title.es;
		expect(paths(sectionsSchema.safeParse(missing))).toContain('1.title.es');
	});

	it('intro is optional', () => {
		const sections = clone(doc('content/sections.yaml'));
		delete sections[0].intro;
		expect(sectionsSchema.safeParse(sections).success).toBe(true);
	});
});

describe('finderSchema', () => {
	it.each(['input', 'tools'])('row missing %s fails with that path', (key) => {
		const finder = clone(doc('content/finder.yaml'));
		delete finder.rows[0][key];
		const result = finderSchema.safeParse(finder);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain(`rows.0.${key}`);
	});

	it('rejects unknown keys, missing rows, and a note without es', () => {
		const unknown = clone(doc('content/finder.yaml'));
		unknown.rows[0].bogus = 1;
		expect(finderSchema.safeParse(unknown).success).toBe(false);
		expect(finderSchema.safeParse({}).success).toBe(false);
		const note = clone(doc('content/finder.yaml'));
		delete note.rows[2].note.es;
		expect(paths(finderSchema.safeParse(note))).toContain('rows.2.note.es');
	});
});

describe('caveatsSchema', () => {
	it('rejects an item without es, an item without id, and unknown keys', () => {
		const noEs = clone(doc('content/caveats.yaml'));
		delete noEs[0].text.es;
		expect(paths(caveatsSchema.safeParse(noEs))).toContain('0.text.es');
		const noId = clone(doc('content/caveats.yaml'));
		delete noId[0].id;
		expect(paths(caveatsSchema.safeParse(noId))).toContain('0.id');
		const unknown = clone(doc('content/caveats.yaml'));
		unknown[0].bogus = 1;
		expect(caveatsSchema.safeParse(unknown).success).toBe(false);
	});
});

describe('toolSchema', () => {
	const always = [
		'id',
		'kind',
		'section',
		'name',
		'url',
		'operator',
		'summary',
		'status',
		'last_verified'
	];
	const toolOnly = ['targets', 'mode', 'inputs', 'output'];

	it.each(always)('missing %s fails with that path (kind tool)', (key) => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		delete tool[key];
		const result = toolSchema.safeParse(tool);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain(key);
	});

	it.each(always.filter((key) => key !== 'id'))(
		'missing %s fails for a framework entry too',
		(key) => {
			const tool = clone(doc('content/tools/fairsfair-metrics.yaml'));
			delete tool[key];
			expect(toolSchema.safeParse(tool).success).toBe(false);
		}
	);

	it.each(toolOnly)('kind tool requires %s', (key) => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		delete tool[key];
		const result = toolSchema.safeParse(tool);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain(key);
	});

	it.each(['framework', 'directory'])('kind %s may omit the tool-only fields', (kind) => {
		const tool = clone(doc('content/tools/fairsfair-metrics.yaml'));
		tool.kind = kind;
		for (const key of toolOnly) expect(tool).not.toHaveProperty(key);
		expect(toolSchema.safeParse(tool).success).toBe(true);
	});

	it.each(['framework', 'directory'])('kind %s may also carry the tool-only fields', (kind) => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		tool.kind = kind;
		expect(toolSchema.safeParse(tool).success).toBe(true);
	});

	it('rejects an unknown kind', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		tool.kind = 'service';
		expect(paths(toolSchema.safeParse(tool))).toContain('kind');
	});

	it('rejects unknown keys at the top level and in operator, api and references', () => {
		const base = doc('content/tools/f-uji.yaml');
		const edits: ((tool: any) => void)[] = [
			(tool) => (tool.bogus = 1),
			(tool) => (tool.operator.bogus = 1),
			(tool) => (tool.api.bogus = 1),
			(tool) => (tool.references[0].bogus = 1)
		];
		for (const edit of edits) {
			const tool = clone(base);
			edit(tool);
			expect(toolSchema.safeParse(tool).success).toBe(false);
		}
	});

	it.each(['summary', 'output', 'best_for', 'status_note'])(
		'localized field %s without es fails with that path',
		(key) => {
			const tool = clone(doc('content/tools/f-uji.yaml'));
			delete tool[key].es;
			const result = toolSchema.safeParse(tool);
			expect(result.success).toBe(false);
			expect(paths(result)).toContain(`${key}.es`);
		}
	);

	it('rejects a localized field without en', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		delete tool.summary.en;
		expect(paths(toolSchema.safeParse(tool))).toContain('summary.en');
	});

	it('optional fields may be omitted entirely', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		for (const key of [
			'best_for',
			'frameworks',
			'api',
			'source_code',
			'self_hostable',
			'license',
			'status_note',
			'references'
		]) {
			delete tool[key];
		}
		expect(toolSchema.safeParse(tool).success).toBe(true);
	});

	it('operator needs a name, and api needs the available flag', () => {
		const operator = clone(doc('content/tools/f-uji.yaml'));
		delete operator.operator.name;
		expect(paths(toolSchema.safeParse(operator))).toContain('operator.name');
		const api = clone(doc('content/tools/f-uji.yaml'));
		delete api.api.available;
		expect(paths(toolSchema.safeParse(api))).toContain('api.available');
	});

	it('rejects ids that are not kebab-case', () => {
		for (const id of ['F-UJI', 'f_uji', 'f uji', '-f-uji']) {
			const tool = clone(doc('content/tools/f-uji.yaml'));
			tool.id = id;
			const result = toolSchema.safeParse(tool);
			expect(result.success, id).toBe(false);
			expect(paths(result), id).toContain('id');
		}
	});

	it('rejects wrong types', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		tool.targets = 'dataset';
		tool.mode = ['automated'];
		const result = toolSchema.safeParse(tool);
		expect(paths(result)).toEqual(expect.arrayContaining(['targets', 'mode']));
	});
});

describe('schema hardening (decisions 2, 3, 9)', () => {
	it('localized and plain strings reject whitespace-only values', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		tool.summary.es = '   ';
		tool.name = ' ';
		expect(paths(toolSchema.safeParse(tool))).toEqual(
			expect.arrayContaining(['summary.es', 'name'])
		);
	});

	it('section ids must be kebab-case', () => {
		const sections = clone(doc('content/sections.yaml'));
		sections[1].id = 'Not_Kebab';
		expect(paths(sectionsSchema.safeParse(sections))).toContain('1.id');
	});

	it('a finder row needs at least one tool', () => {
		const finder = clone(doc('content/finder.yaml'));
		finder.rows[0].tools = [];
		expect(paths(finderSchema.safeParse(finder))).toContain('rows.0.tools');
	});

	it.each(['https:foo', 'https:/foo', 'https://', 'http://example.org', 'example.org'])(
		'url %j is rejected',
		(url) => {
			const tool = clone(doc('content/tools/f-uji.yaml'));
			tool.url = url;
			expect(paths(toolSchema.safeParse(tool))).toContain('url');
		}
	);

	it('url accepts https with a host, a port and a path', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		tool.url = 'https://example.org:8443/a/b?c=d#e';
		expect(toolSchema.safeParse(tool).success).toBe(true);
	});

	it.each([
		['limited', 'status_note'],
		['unverified', 'status_note'],
		['discontinued', 'references'],
		['discontinued', 'status_note']
	])('status %s without %s fails with that path', (status, field) => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		tool.status = status;
		delete tool[field];
		expect(paths(toolSchema.safeParse(tool))).toContain(field);
	});

	it('discontinued with empty references fails at references', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		tool.status = 'discontinued';
		tool.references = [];
		expect(paths(toolSchema.safeParse(tool))).toContain('references');
	});

	it('available needs neither status_note nor references', () => {
		const tool = clone(doc('content/tools/f-uji.yaml'));
		delete tool.status_note;
		delete tool.references;
		expect(toolSchema.safeParse(tool).success).toBe(true);
	});
});

describe('siteSchema: shortName', () => {
	it('is optional', () => {
		const site = clone(doc('content/site.yaml'));
		delete site.shortName;
		expect(siteSchema.safeParse(site).success).toBe(true);
	});

	it('is accepted when it has en and es', () => {
		const site = clone(doc('content/site.yaml'));
		site.shortName = { en: 'FAIR', es: 'FAIR' };
		const result = siteSchema.safeParse(site);
		expect(result.success).toBe(true);
		expect(result.data?.shortName).toEqual({ en: 'FAIR', es: 'FAIR' });
	});

	it('fails without es, with that path', () => {
		const site = clone(doc('content/site.yaml'));
		site.shortName = { en: 'FAIR' };
		const result = siteSchema.safeParse(site);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain('shortName.es');
	});

	it('fails without en, with that path', () => {
		const site = clone(doc('content/site.yaml'));
		site.shortName = { es: 'FAIR' };
		const result = siteSchema.safeParse(site);
		expect(result.success).toBe(false);
		expect(paths(result)).toContain('shortName.en');
	});

	it('rejects whitespace-only text', () => {
		const site = clone(doc('content/site.yaml'));
		site.shortName = { en: '  ', es: 'FAIR' };
		expect(siteSchema.safeParse(site).success).toBe(false);
	});
});
