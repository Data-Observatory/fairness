import { describe, expect, it } from 'vitest';
import { loadContent } from './content';
import { buildChangelogView, lastUpdated } from './changelog';
import { loadFixtureFiles, mutate } from './__fixtures__/helpers';

const TODAY = new Date(2025, 5, 1);
const CHANGELOG = 'content/changelog.yaml';

const fixture = (edit: (files: Record<string, string>) => Record<string, string> = (f) => f) =>
	loadContent(edit(loadFixtureFiles()), { today: TODAY });

describe('buildChangelogView', () => {
	it('groups the entries by date, newest first, keeping the file order inside a date', () => {
		const view = buildChangelogView(fixture(), 'en');
		expect(view.days.map((day) => day.date)).toEqual(['2025-01-20', '2025-01-10']);
		expect(view.days[0].entries.map((entry) => entry.text)).toEqual([
			'Two entries were added.',
			'The Spanish texts were revised.'
		]);
		expect(view.days[1].entries.map((entry) => entry.text)).toEqual(['First release.']);
	});

	it('uses the text of the requested locale', () => {
		const view = buildChangelogView(fixture(), 'es');
		expect(view.days[0].entries[0].text).toBe('Se agregaron dos fichas.');
		expect(view.days[1].entries[0].text).toBe('Primera publicación.');
	});

	it('lists the tools of an entry with id and name, in the order of the file', () => {
		const view = buildChangelogView(fixture(), 'en');
		expect(view.days[0].entries[0].tools).toEqual([
			{ id: 'f-uji', name: 'F-UJI' },
			{ id: 'fair-enough', name: 'FAIR Enough' }
		]);
		expect(view.days[1].entries[0].tools).toEqual([
			{ id: 'fairsfair-metrics', name: expect.any(String) }
		]);
	});

	it('gives an empty tools list to an entry without tools', () => {
		const view = buildChangelogView(fixture(), 'en');
		expect(view.days[0].entries[1].tools).toEqual([]);
	});

	it('is the same for both locales except for the text', () => {
		const en = buildChangelogView(fixture(), 'en');
		const es = buildChangelogView(fixture(), 'es');
		expect(es.days.map((day) => day.date)).toEqual(en.days.map((day) => day.date));
		expect(es.days.map((day) => day.entries.map((entry) => entry.tools))).toEqual(
			en.days.map((day) => day.entries.map((entry) => entry.tools))
		);
	});

	it('does not modify the content it is given', () => {
		const content = fixture();
		const before = structuredClone(content.changelog);
		buildChangelogView(content, 'en');
		expect(content.changelog).toEqual(before);
	});
});

describe('lastUpdated', () => {
	it('is the date of the newest entry', () => {
		expect(lastUpdated(fixture())).toBe('2025-01-20');
	});

	it('follows the content when a newer entry is added at the top', () => {
		const content = fixture((files) =>
			mutate(files, CHANGELOG, (entries) =>
				entries.unshift({ date: '2025-03-01', text: { en: 'Newer.', es: 'Más reciente.' } })
			)
		);
		expect(lastUpdated(content)).toBe('2025-03-01');
	});

	it('is a plain ISO date string', () => {
		expect(lastUpdated(fixture())).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});
});
