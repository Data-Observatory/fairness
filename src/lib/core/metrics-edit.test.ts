import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { applyMetricChanges } from './metrics-edit';
import type { Change } from './metrics-refresh';

// The edit changes only the scalar values (and inserts a release) inside the metrics block. Every
// other byte of the file, comments and quoting included, stays as it was.

const FILE = `# yaml-language-server: $schema=../tool.schema.json
id: f-uji
kind: tool
name: F-UJI # the name
summary:
  en: >-
    F-UJI is a web service that assesses the FAIRness of research data objects at the dataset
    level.
  es: 'Servicio web: evalúa objetos de datos.'
source_code: https://github.com/pangaea-data-publisher/fuji
status: available
last_verified: 2026-11-02
metrics:
  checked: 2026-11-24 # date of the last refresh
  citations:
    - label: Patterns, 2021
      doi: 10.1016/j.patter.2021.100370
      count: 110
  github:
    stars: 82
    forks: 53
    contributors: 23
    last_push: 2026-11-05 # last commit
    last_release:
      tag: v4.0.1
      date: 2026-09-24
  downloads:
    - source: zenodo
      record: '15045911'
      count: 17372
      period: total
    - source: pypi
      package: howfairis
      count: 2114
      period: last_30_days
references:
  - title: F-UJI documents
    url: https://www.f-uji.net/
`;

const change = (
	path: (string | number)[],
	current: Change['current'],
	recorded?: Change['recorded']
) => ({ toolId: 'f-uji', field: path.join('.'), path, recorded, current }) as Change;

describe('applyMetricChanges', () => {
	it('returns the same text when there are no changes', () => {
		expect(applyMetricChanges(FILE, [])).toBe(FILE);
	});

	it('replaces counts and dates and changes nothing else', () => {
		const result = applyMetricChanges(FILE, [
			change(['metrics', 'citations', 0, 'count'], 124),
			change(['metrics', 'github', 'stars'], 90),
			change(['metrics', 'github', 'last_push'], '2026-12-01'),
			change(['metrics', 'downloads', 1, 'count'], 2300),
			change(['metrics', 'checked'], '2026-12-07')
		]);
		const expected = FILE.replace('count: 110', 'count: 124')
			.replace('stars: 82', 'stars: 90')
			.replace('last_push: 2026-11-05', 'last_push: 2026-12-01')
			.replace('count: 2114', 'count: 2300')
			.replace('checked: 2026-11-24', 'checked: 2026-12-07');
		expect(result).toBe(expected);
		// Comments on the same lines survive.
		expect(result).toContain('checked: 2026-12-07 # date of the last refresh');
		expect(result).toContain('last_push: 2026-12-01 # last commit');
	});

	it('replaces the release tag and date in place', () => {
		const result = applyMetricChanges(FILE, [
			change(['metrics', 'github', 'last_release', 'tag'], 'v4.1.0'),
			change(['metrics', 'github', 'last_release', 'date'], '2026-11-30')
		]);
		expect(result).toBe(
			FILE.replace('tag: v4.0.1', 'tag: v4.1.0').replace('date: 2026-09-24', 'date: 2026-11-30')
		);
	});

	it('quotes a tag that would otherwise be read as a number or a boolean', () => {
		for (const tag of ['2.0', '10', 'true', 'null']) {
			const result = applyMetricChanges(FILE, [
				change(['metrics', 'github', 'last_release', 'tag'], tag)
			]);
			expect(parse(result).metrics.github.last_release.tag, tag).toBe(tag);
		}
	});

	it('keeps the quote style of a scalar that is already quoted', () => {
		const quoted = FILE.replace('tag: v4.0.1', 'tag: "v4.0.1"');
		const result = applyMetricChanges(quoted, [
			change(['metrics', 'github', 'last_release', 'tag'], 'v4.1.0')
		]);
		expect(result).toContain('tag: "v4.1.0"');
	});

	it('inserts a release after the last push line, with the same indentation and the comment kept', () => {
		const without = FILE.replace(
			'    last_release:\n      tag: v4.0.1\n      date: 2026-09-24\n',
			''
		);
		expect(parse(without).metrics.github.last_release).toBeUndefined();
		const result = applyMetricChanges(without, [
			change(['metrics', 'github', 'last_release'], { tag: 'v4.0.1', date: '2026-09-24' })
		]);
		expect(result).toBe(FILE);
		expect(parse(result).metrics.github.last_release).toEqual({
			tag: 'v4.0.1',
			date: '2026-09-24'
		});
	});

	it('inserts a release when the last push line ends the file', () => {
		const tail = `metrics:\n  checked: 2026-11-24\n  github:\n    stars: 1\n    forks: 0\n    contributors: 1\n    last_push: 2026-11-05`;
		const result = applyMetricChanges(tail, [
			change(['metrics', 'github', 'last_release'], { tag: 'v1', date: '2026-11-01' })
		]);
		expect(parse(result).metrics.github.last_release).toEqual({ tag: 'v1', date: '2026-11-01' });
		expect(result.startsWith(tail)).toBe(true);
	});

	it('keeps CRLF line endings when it inserts', () => {
		const crlf = FILE.replace(
			'    last_release:\n      tag: v4.0.1\n      date: 2026-09-24\n',
			''
		).replace(/\n/g, '\r\n');
		const result = applyMetricChanges(crlf, [
			change(['metrics', 'github', 'last_release'], { tag: 'v1', date: '2026-11-01' })
		]);
		expect(result.replace(/\r\n/g, '')).not.toContain('\n');
		expect(parse(result).metrics.github.last_release).toEqual({ tag: 'v1', date: '2026-11-01' });
	});

	it('throws when a path does not exist, so a wrong edit is never written', () => {
		expect(() => applyMetricChanges(FILE, [change(['metrics', 'github', 'watchers'], 3)])).toThrow(
			/metrics\.github\.watchers/
		);
		expect(() =>
			applyMetricChanges(FILE, [change(['metrics', 'citations', 4, 'count'], 3)])
		).toThrow();
	});

	it('throws when the change would insert a release into an entry that has none of github', () => {
		const none = `id: x\nmetrics:\n  checked: 2026-11-24\n  citations:\n    - label: a\n      doi: 10.1234/abc\n      count: 1\n`;
		expect(() =>
			applyMetricChanges(none, [
				change(['metrics', 'github', 'last_release'], { tag: 'v1', date: '2026-11-01' })
			])
		).toThrow();
	});

	it('produces text that parses to the old data with only the changes applied', () => {
		const before = parse(FILE);
		const after = parse(
			applyMetricChanges(FILE, [
				change(['metrics', 'github', 'forks'], 60),
				change(['metrics', 'downloads', 0, 'count'], 18000)
			])
		);
		before.metrics.github.forks = 60;
		before.metrics.downloads[0].count = 18000;
		expect(after).toEqual(before);
	});
});
