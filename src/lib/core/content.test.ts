import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContentError, loadContent } from './content';
import { issuesOf, loadFixtureFiles, mutate, without, type Files } from './__fixtures__/helpers';

const valid = loadFixtureFiles();
const SITE = 'content/site.yaml';
const TAXONOMY = 'content/taxonomy.yaml';
const SECTIONS = 'content/sections.yaml';
const FINDER = 'content/finder.yaml';
const CAVEATS = 'content/caveats.yaml';
const FUJI = 'content/tools/f-uji.yaml';
const ENOUGH = 'content/tools/fair-enough.yaml';
const FRAMEWORK = 'content/tools/fairsfair-metrics.yaml';

const issue = (file: string, path: string) => expect.objectContaining({ file, path });

describe('loadContent: valid set', () => {
	it('loads the minimal valid fixture', () => {
		const content = loadContent(valid);
		expect(content.site.name.en).toBe('FAIR Resources Finder');
		expect(content.site.locales).toEqual(['en', 'es']);
		expect(content.taxonomy.filters).toEqual(['target', 'mode', 'input', 'framework', 'status']);
		expect(content.sections.map((section) => section.id)).toEqual([
			'datasets',
			'frameworks',
			'directories'
		]);
		expect(content.finder.rows).toHaveLength(3);
		expect(content.caveats).toHaveLength(3);
	});

	it('returns the tools sorted by id (plain string order)', () => {
		const content = loadContent(valid);
		expect(content.tools.map((tool) => tool.id)).toEqual([
			'f-uji',
			'fair-catalogue',
			'fair-enough',
			'fairsfair-metrics'
		]);
	});

	it('does not throw a ContentError for the valid set', () => {
		expect(() => loadContent(valid)).not.toThrow();
	});

	it('framework and directory entries may omit the tool-only fields', () => {
		const content = loadContent(valid);
		const framework = content.tools.find((tool) => tool.id === 'fairsfair-metrics');
		const directory = content.tools.find((tool) => tool.id === 'fair-catalogue');
		expect(framework?.kind).toBe('framework');
		expect(directory?.kind).toBe('directory');
		expect(framework).not.toHaveProperty('targets');
		expect(directory).not.toHaveProperty('mode');
	});

	it('accepts a tool without any optional field', () => {
		const files = mutate(valid, FUJI, (tool) => {
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
		});
		expect(() => loadContent(files)).not.toThrow();
	});
});

describe('ContentError', () => {
	it('is an Error subclass carrying structured issues', () => {
		const files = without(valid, SITE);
		let caught: unknown;
		try {
			loadContent(files);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(ContentError);
		expect(caught).toBeInstanceOf(Error);
		const issues = (caught as ContentError).issues;
		expect(issues.length).toBeGreaterThan(0);
		for (const item of issues) {
			expect(typeof item.file).toBe('string');
			expect(typeof item.path).toBe('string');
			expect(typeof item.message).toBe('string');
		}
	});

	it('reports several problems at once', () => {
		const files = mutate(
			mutate(valid, FUJI, (tool) => delete tool.url),
			ENOUGH,
			(tool) => delete tool.status
		);
		const issues = issuesOf(files);
		expect(issues).toContainEqual(issue(FUJI, 'url'));
		expect(issues).toContainEqual(issue(ENOUGH, 'status'));
	});
});

describe('loadContent: files and syntax', () => {
	it.each([SITE, TAXONOMY, SECTIONS, FINDER, CAVEATS])('missing %s is reported', (file) => {
		const issues = issuesOf(without(valid, file));
		expect(issues).toContainEqual(
			expect.objectContaining({ file, message: expect.stringMatching(/missing|not found/i) })
		);
	});

	it('reports invalid YAML against its file', () => {
		const files: Files = { ...valid, [FUJI]: 'id: [unterminated\nkind: tool' };
		expect(issuesOf(files)).toContainEqual(expect.objectContaining({ file: FUJI }));
	});
});

describe('loadContent: schema failures carry file and path', () => {
	it('missing required tool field', () => {
		const files = mutate(valid, FUJI, (tool) => delete tool.summary);
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'summary'));
	});

	it('missing required tool-only field on a tool', () => {
		const files = mutate(valid, FUJI, (tool) => delete tool.inputs);
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'inputs'));
	});

	it('missing required site field', () => {
		const files = mutate(valid, SITE, (site) => delete site.verification);
		expect(issuesOf(files)).toContainEqual(issue(SITE, 'verification'));
	});

	it('missing required nested field names the nested path', () => {
		const files = mutate(valid, SITE, (site) => delete site.verification.staleAfterDays);
		expect(issuesOf(files)).toContainEqual(issue(SITE, 'verification.staleAfterDays'));
	});

	it('unknown key at the top level names the key', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.bogus = 'x'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'bogus'));
	});

	it('unknown nested key names the full path', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.operator.extra = 'x'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'operator.extra'));
	});

	it('unknown key in a list item names the full path', () => {
		const files = mutate(valid, SECTIONS, (sections) => (sections[1].extra = 'x'));
		expect(issuesOf(files)).toContainEqual(issue(SECTIONS, '1.extra'));
	});

	it.each([
		[FUJI, 'summary', 'summary.es'],
		[FUJI, 'best_for', 'best_for.es'],
		[FUJI, 'output', 'output.es'],
		[ENOUGH, 'summary', 'summary.es']
	])('missing es on %s field %s', (file, field, expected) => {
		const files = mutate(valid, file, (tool) => delete tool[field].es);
		expect(issuesOf(files)).toContainEqual(issue(file, expected));
	});

	it('missing es on site, taxonomy, sections, finder and caveats', () => {
		expect(issuesOf(mutate(valid, SITE, (site) => delete site.tagline.es))).toContainEqual(
			issue(SITE, 'tagline.es')
		);
		expect(
			issuesOf(mutate(valid, TAXONOMY, (taxonomy) => delete taxonomy.status[1].label.es))
		).toContainEqual(issue(TAXONOMY, 'status.1.label.es'));
		expect(
			issuesOf(mutate(valid, SECTIONS, (sections) => delete sections[0].intro.es))
		).toContainEqual(issue(SECTIONS, '0.intro.es'));
		expect(
			issuesOf(mutate(valid, FINDER, (finder) => delete finder.rows[2].note.es))
		).toContainEqual(issue(FINDER, 'rows.2.note.es'));
		expect(issuesOf(mutate(valid, CAVEATS, (caveats) => delete caveats[2].text.es))).toContainEqual(
			issue(CAVEATS, '2.text.es')
		);
	});

	it('a locale that site.yaml does not declare is rejected', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.summary.de = 'Zusammenfassung'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'summary.de'));
	});

	it('defaultLocale must be one of locales', () => {
		const files = mutate(valid, SITE, (site) => (site.defaultLocale = 'fr'));
		expect(issuesOf(files)).toContainEqual(issue(SITE, 'defaultLocale'));
	});
});

describe('loadContent: ids', () => {
	it('id must equal the file name', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.id = 'other-id'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'id'));
	});

	it('duplicate tool id is reported', () => {
		const files: Files = { ...valid, 'content/tools/f-uji-copy.yaml': valid[FUJI] };
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({ path: 'id', message: expect.stringMatching(/duplicate/i) })
		);
	});

	it('duplicate section id is reported', () => {
		const files = mutate(valid, SECTIONS, (sections) => (sections[2].id = 'datasets'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({
				file: SECTIONS,
				path: '2.id',
				message: expect.stringMatching(/duplicate/i)
			})
		);
	});

	it('duplicate taxonomy id within a group is reported', () => {
		const files = mutate(valid, TAXONOMY, (taxonomy) => (taxonomy.mode[1].id = 'automated'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({
				file: TAXONOMY,
				path: 'mode.1.id',
				message: expect.stringMatching(/duplicate/i)
			})
		);
	});

	it('the same id in different taxonomy groups is allowed', () => {
		// 'automated' already exists in mode; reusing it in input is allowed (uniqueness is per group).
		const files = mutate(valid, TAXONOMY, (taxonomy) => (taxonomy.input[5].id = 'automated'));
		expect(() => loadContent(files)).not.toThrow();
	});

	it('taxonomy filters must name existing groups', () => {
		const files = mutate(valid, TAXONOMY, (taxonomy) => (taxonomy.filters[1] = 'colour'));
		expect(issuesOf(files)).toContainEqual(issue(TAXONOMY, 'filters.1'));
	});
});

describe('loadContent: references resolve', () => {
	it('unknown section id on a tool', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.section = 'nowhere'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'section'));
	});

	it('unknown target id', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.targets = ['dataset', 'planet']));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'targets.1'));
	});

	it('unknown mode id', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.mode = 'psychic'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'mode'));
	});

	it('unknown input id', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.inputs = ['doi', 'fax']));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'inputs.1'));
	});

	it('unknown framework id', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.frameworks = ['made_up']));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'frameworks.0'));
	});

	it('unknown status id', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.status = 'thriving'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'status'));
	});

	it('unknown status id on a framework entry', () => {
		const files = mutate(valid, FRAMEWORK, (tool) => (tool.status = 'thriving'));
		expect(issuesOf(files)).toContainEqual(issue(FRAMEWORK, 'status'));
	});

	it('unknown tool id in a finder row', () => {
		const files = mutate(valid, FINDER, (finder) => finder.rows[0].tools.push('ghost-tool'));
		expect(issuesOf(files)).toContainEqual(issue(FINDER, 'rows.0.tools.2'));
	});

	it('unknown input id in a finder row', () => {
		const files = mutate(valid, FINDER, (finder) => (finder.rows[1].input = 'fax'));
		expect(issuesOf(files)).toContainEqual(issue(FINDER, 'rows.1.input'));
	});
});

describe('loadContent: finder rows only list tools that accept the input', () => {
	it('a tool whose inputs do not include the row input is reported', () => {
		// fair-enough accepts doi and metadata_url, not landing_page_url.
		const files = mutate(valid, FINDER, (finder) => finder.rows[1].tools.push('fair-enough'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({
				file: FINDER,
				path: 'rows.1.tools.1',
				message: expect.stringMatching(/input/i)
			})
		);
	});

	it('a framework or directory entry has no inputs and is reported', () => {
		const files = mutate(valid, FINDER, (finder) => finder.rows[0].tools.push('fairsfair-metrics'));
		expect(issuesOf(files)).toContainEqual(issue(FINDER, 'rows.0.tools.2'));
	});

	it('changing a tool so it no longer accepts a listed input is reported on the finder row', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.inputs = ['doi']));
		expect(issuesOf(files)).toContainEqual(issue(FINDER, 'rows.1.tools.0'));
	});

	it('the unchanged fixture has no such problem', () => {
		expect(() => loadContent(valid)).not.toThrow();
	});
});

describe('loadContent: URLs must be https', () => {
	it.each([
		[FUJI, 'url', (tool: any) => (tool.url = 'http://example.org/f-uji')],
		[FUJI, 'operator.url', (tool: any) => (tool.operator.url = 'http://example.org/op')],
		[FUJI, 'api.url', (tool: any) => (tool.api.url = 'http://example.org/api')],
		[FUJI, 'source_code', (tool: any) => (tool.source_code = 'http://example.org/src')],
		[FUJI, 'references.0.url', (tool: any) => (tool.references[0].url = 'http://example.org/p')],
		[FUJI, 'url', (tool: any) => (tool.url = 'ftp://example.org/f-uji')],
		[FUJI, 'url', (tool: any) => (tool.url = 'example.org/f-uji')]
	])('%s at %s', (file, path, edit) => {
		const issues = issuesOf(mutate(valid, file, edit));
		expect(issues).toContainEqual(
			expect.objectContaining({ file, path, message: expect.stringMatching(/https/i) })
		);
	});

	it.each([
		['repository', (site: any) => (site.repository = 'http://github.com/x/y')],
		['contributeUrl', (site: any) => (site.contributeUrl = 'http://github.com/x/y')]
	])('site %s', (path, edit) => {
		expect(issuesOf(mutate(valid, SITE, edit))).toContainEqual(issue(SITE, path));
	});

	it('https URLs pass', () => {
		expect(() => loadContent(valid)).not.toThrow();
	});
});

describe('loadContent: last_verified', () => {
	it('a future date is reported', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.last_verified = '2999-01-01'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({
				file: FUJI,
				path: 'last_verified',
				message: expect.stringMatching(/future/i)
			})
		);
	});

	it.each(['not-a-date', '2025-02-30', '2025-13-01', '15/01/2025', '2025-1-5'])(
		'invalid date %s is reported',
		(value) => {
			const files = mutate(valid, FUJI, (tool) => (tool.last_verified = value));
			expect(issuesOf(files)).toContainEqual(issue(FUJI, 'last_verified'));
		}
	);

	it('a past date passes', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.last_verified = '2020-02-29'));
		expect(() => loadContent(files)).not.toThrow();
	});
});

describe('loadContent: TODO in a non-default locale', () => {
	it('TODO in es fails on a summary', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.summary.es = 'TODO'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({
				file: FUJI,
				path: 'summary.es',
				message: expect.stringMatching(/TODO/)
			})
		);
	});

	it('TODO in es fails on an optional field', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.best_for.es = 'TODO'));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'best_for.es'));
	});

	it('TODO in es fails outside tool files', () => {
		const files = mutate(valid, SITE, (site) => (site.tagline.es = 'TODO'));
		expect(issuesOf(files)).toContainEqual(issue(SITE, 'tagline.es'));
	});

	it('TODO in the default locale is not this rule', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.summary.en = 'TODO'));
		expect(() => loadContent(files)).not.toThrow();
	});

	it('text that merely contains TODO passes', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.summary.es = 'Lista TODO de tareas.'));
		expect(() => loadContent(files)).not.toThrow();
	});

	it('the rule follows site.yaml: the default locale is exempt, others are not', () => {
		const files = mutate(
			mutate(valid, SITE, (site) => (site.defaultLocale = 'es')),
			FUJI,
			(tool) => (tool.summary.en = 'TODO')
		);
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'summary.en'));
	});
});

describe('loadContent: TODO rule (decision 2)', () => {
	const es = (value: string) => mutate(valid, FUJI, (tool) => (tool.summary.es = value));

	it.each(['TODO: traducir', 'TODO traducir', '  TODO', 'TODO-traducir', 'TODO.'])(
		'flags %j in a non-default locale',
		(value) => {
			expect(issuesOf(es(value))).toContainEqual(
				expect.objectContaining({
					file: FUJI,
					path: 'summary.es',
					message: expect.stringMatching(/TODO/)
				})
			);
		}
	);

	it.each(['Todo el contenido', 'todo listo', 'TODOS los datos', 'Lista TODO de tareas', 'todo'])(
		'allows %j (Spanish "todo", or TODO not at the start)',
		(value) => {
			expect(() => loadContent(es(value))).not.toThrow();
		}
	);

	it('is case-sensitive: lowercase and mixed case "todo" never count as the marker', () => {
		expect(() => loadContent(es('todo: lista'))).not.toThrow();
		expect(() => loadContent(es('Todo: lista'))).not.toThrow();
	});

	it('still exempts the default locale', () => {
		expect(() =>
			loadContent(mutate(valid, FUJI, (tool) => (tool.summary.en = 'TODO: write')))
		).not.toThrow();
	});
});

describe('loadContent: blank strings (decision 2)', () => {
	it('whitespace-only localized strings are rejected with the field path', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.summary.es = '   '));
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'summary.es'));
		const en = mutate(valid, FUJI, (tool) => (tool.summary.en = '\t\n'));
		expect(issuesOf(en)).toContainEqual(issue(FUJI, 'summary.en'));
	});

	it('whitespace-only plain strings are rejected with the field path', () => {
		expect(issuesOf(mutate(valid, FUJI, (tool) => (tool.name = '  ')))).toContainEqual(
			issue(FUJI, 'name')
		);
		expect(issuesOf(mutate(valid, FUJI, (tool) => (tool.operator.name = ' ')))).toContainEqual(
			issue(FUJI, 'operator.name')
		);
		expect(issuesOf(mutate(valid, SITE, (site) => (site.domain = '  ')))).toContainEqual(
			issue(SITE, 'domain')
		);
	});

	it('surrounding whitespace on a non-blank string is allowed', () => {
		expect(() => loadContent(mutate(valid, FUJI, (tool) => (tool.name = ' F-UJI ')))).not.toThrow();
	});
});

describe('loadContent: status evidence (specs 7.2)', () => {
	const noNote = (status: string, file = FUJI) =>
		mutate(valid, file, (tool) => {
			tool.status = status;
			delete tool.status_note;
		});

	it.each(['limited', 'unverified'])('status %s requires status_note', (status) => {
		expect(issuesOf(noNote(status))).toContainEqual(issue(FUJI, 'status_note'));
	});

	it.each(['limited', 'unverified'])('status %s with a status_note passes', (status) => {
		const files = mutate(valid, FUJI, (tool) => (tool.status = status));
		expect(() => loadContent(files)).not.toThrow();
	});

	it('applies to framework entries as well', () => {
		expect(issuesOf(noNote('limited', FRAMEWORK))).toContainEqual(issue(FRAMEWORK, 'status_note'));
	});

	it('available does not require status_note', () => {
		expect(() => loadContent(noNote('available'))).not.toThrow();
	});

	it('discontinued requires non-empty references and a status_note', () => {
		const none = mutate(valid, FUJI, (tool) => {
			tool.status = 'discontinued';
			delete tool.references;
			delete tool.status_note;
		});
		const found = issuesOf(none);
		expect(found).toContainEqual(issue(FUJI, 'references'));
		expect(found).toContainEqual(issue(FUJI, 'status_note'));
	});

	it('discontinued with an empty references list is rejected', () => {
		const files = mutate(valid, FUJI, (tool) => {
			tool.status = 'discontinued';
			tool.references = [];
		});
		expect(issuesOf(files)).toContainEqual(issue(FUJI, 'references'));
	});

	it('discontinued with references and a note passes', () => {
		const files = mutate(valid, FUJI, (tool) => (tool.status = 'discontinued'));
		expect(() => loadContent(files)).not.toThrow();
	});
});

describe.each(['Pacific/Auckland', 'America/Los_Angeles', 'UTC'])(
	'loadContent: last_verified uses the local calendar date (TZ=%s)',
	(zone) => {
		const previous = process.env.TZ;
		beforeEach(() => {
			process.env.TZ = zone;
		});
		afterEach(() => {
			if (previous === undefined) delete process.env.TZ;
			else process.env.TZ = previous;
		});

		const withDate = (date: string) => mutate(valid, FUJI, (tool) => (tool.last_verified = date));

		it('equal to today passes, early in the local day', () => {
			const today = new Date(2026, 9, 26, 1, 0);
			expect(() => loadContent(withDate('2026-10-26'), { today })).not.toThrow();
		});

		it('tomorrow fails, early in the local day', () => {
			const today = new Date(2026, 9, 26, 1, 0);
			let caught: unknown;
			try {
				loadContent(withDate('2026-10-27'), { today });
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(ContentError);
			expect((caught as ContentError).issues).toContainEqual(
				expect.objectContaining({
					file: FUJI,
					path: 'last_verified',
					message: expect.stringMatching(/future/i)
				})
			);
		});

		it('equal to today passes, late in the local day', () => {
			const today = new Date(2026, 9, 25, 23, 0);
			expect(() => loadContent(withDate('2026-10-25'), { today })).not.toThrow();
		});

		it('tomorrow fails, late in the local day', () => {
			const today = new Date(2026, 9, 25, 23, 0);
			expect(() => loadContent(withDate('2026-10-26'), { today })).toThrow(ContentError);
		});
	}
);

describe('loadContent: stricter checks (decision 9)', () => {
	const duplicate = expect.stringMatching(/duplicate/i);

	it('a tool id repeated inside one finder row is reported at the repeat', () => {
		const files = mutate(valid, FINDER, (finder) => finder.rows[0].tools.push('f-uji'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({ file: FINDER, path: 'rows.0.tools.2', message: duplicate })
		);
	});

	it('two finder rows for the same input are reported at the second row', () => {
		const files = mutate(valid, FINDER, (finder) => (finder.rows[2].input = 'doi'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({ file: FINDER, path: 'rows.2.input', message: duplicate })
		);
	});

	it('an entry repeated in taxonomy.filters is reported at the repeat', () => {
		const files = mutate(valid, TAXONOMY, (taxonomy) => taxonomy.filters.push('mode'));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({ file: TAXONOMY, path: 'filters.5', message: duplicate })
		);
	});

	it('a repeated caveat id is reported at the repeat', () => {
		const files = mutate(valid, CAVEATS, (caveats) => (caveats[2].id = caveats[0].id));
		expect(issuesOf(files)).toContainEqual(
			expect.objectContaining({ file: CAVEATS, path: '2.id', message: duplicate })
		);
	});

	it.each(['Data_Sets', 'data sets', '-datasets', 'Datasets'])(
		'section id %j must be kebab-case',
		(id) => {
			const files = mutate(valid, SECTIONS, (sections) => (sections[0].id = id));
			expect(issuesOf(files)).toContainEqual(
				expect.objectContaining({
					file: SECTIONS,
					path: '0.id',
					message: expect.stringMatching(/kebab/i)
				})
			);
		}
	);

	it('a finder row with no tools is reported', () => {
		const files = mutate(valid, FINDER, (finder) => (finder.rows[1].tools = []));
		expect(issuesOf(files)).toContainEqual(issue(FINDER, 'rows.1.tools'));
	});

	it('style.forbiddenTerms keys must be declared locales', () => {
		const files = mutate(valid, SITE, (site) => (site.style.forbiddenTerms.de = ['beste']));
		expect(issuesOf(files)).toContainEqual(issue(SITE, 'style.forbiddenTerms.de'));
	});

	it('declared locales may omit a forbiddenTerms list', () => {
		const files = mutate(valid, SITE, (site) => delete site.style.forbiddenTerms.es);
		expect(() => loadContent(files)).not.toThrow();
	});

	describe('files outside the expected layout', () => {
		const extra = (path: string): Files => ({ ...valid, [path]: valid[FUJI] });

		it.each([
			'content/tools/sub/x.yaml',
			'content/findr.yaml',
			'content/tools/f-uji.yml',
			'content/notes.txt',
			'content/sub/site.yaml'
		])('%s produces an issue naming the file', (path) => {
			expect(issuesOf(extra(path))).toContainEqual(
				expect.objectContaining({ file: path, message: expect.stringMatching(/unexpected/i) })
			);
		});

		it('the five known files, tool files and _template.yaml are accepted', () => {
			expect(() => loadContent(extra('content/tools/_template.yaml'))).not.toThrow();
			expect(() => loadContent(valid)).not.toThrow();
		});
	});

	it.each(['https:foo', 'https:/foo', 'https://', 'https:///path', 'https://  '])(
		'URL %j is rejected (https:// plus a host is required)',
		(url) => {
			const files = mutate(valid, FUJI, (tool) => (tool.url = url));
			expect(issuesOf(files)).toContainEqual(
				expect.objectContaining({
					file: FUJI,
					path: 'url',
					message: expect.stringMatching(/https/i)
				})
			);
		}
	);
});

describe('loadContent: shortName', () => {
	it('loads a site.yaml variant with a localized shortName', () => {
		const files = mutate(valid, SITE, (site) => (site.shortName = { en: 'FAIR', es: 'FAIR ES' }));
		const content = loadContent(files);
		expect(content.site.shortName).toEqual({ en: 'FAIR', es: 'FAIR ES' });
	});

	it('the valid fixture loads without shortName', () => {
		expect(loadContent(valid).site.shortName).toBeUndefined();
	});

	it('a half-filled shortName is reported against its path', () => {
		const files = mutate(valid, SITE, (site) => (site.shortName = { en: 'FAIR' }));
		expect(issuesOf(files)).toContainEqual(issue(SITE, 'shortName.es'));
	});

	it('a TODO placeholder in shortName.es is reported like any localized field', () => {
		const files = mutate(valid, SITE, (site) => (site.shortName = { en: 'FAIR', es: 'TODO' }));
		expect(issuesOf(files)).toContainEqual(issue(SITE, 'shortName.es'));
	});
});
