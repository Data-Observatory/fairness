import { describe, expect, it } from 'vitest';
import {
	COMPARE_MAX,
	buildCompareView,
	buildComparePage,
	isCompareOptionDisabled,
	selectCompareView,
	toggleCompareId
} from './compare';
import { loadContent } from './content';
import { loadFixtureFiles } from './__fixtures__/helpers';

const TODAY = new Date(2025, 5, 1);
const content = () => loadContent(loadFixtureFiles(), { today: TODAY });

describe('toggleCompareId', () => {
	it('appends a checked id at the end', () => {
		expect(toggleCompareId(['a'], 'b', true)).toEqual(['a', 'b']);
	});

	it('removes an unchecked id and keeps the order of the others', () => {
		expect(toggleCompareId(['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c']);
	});

	it('does not add an id twice', () => {
		expect(toggleCompareId(['a', 'b'], 'a', true)).toEqual(['a', 'b']);
	});

	it('does not add an id beyond the maximum', () => {
		expect(toggleCompareId(['a', 'b', 'c'], 'd', true)).toEqual(['a', 'b', 'c']);
		expect(toggleCompareId(['a', 'b'], 'c', true, 2)).toEqual(['a', 'b']);
	});

	it('does not change the list it is given', () => {
		const ids = ['a'];
		toggleCompareId(ids, 'b', true);
		expect(ids).toEqual(['a']);
	});

	it('removing an id that is not selected changes nothing', () => {
		expect(toggleCompareId(['a'], 'z', false)).toEqual(['a']);
	});
});

describe('isCompareOptionDisabled', () => {
	it('is false while fewer than the maximum are selected', () => {
		expect(isCompareOptionDisabled([], 'a')).toBe(false);
		expect(isCompareOptionDisabled(['a', 'b'], 'c')).toBe(false);
	});

	it('is true for an unselected id once the maximum is reached', () => {
		expect(isCompareOptionDisabled(['a', 'b', 'c'], 'd')).toBe(true);
		expect(isCompareOptionDisabled(['a', 'b'], 'c', 2)).toBe(true);
	});

	it('is false for a selected id even at the maximum, so it can be cleared', () => {
		expect(isCompareOptionDisabled(['a', 'b', 'c'], 'b')).toBe(false);
	});
});

describe('selectCompareView', () => {
	const allIds = ['f-uji', 'fair-enough'];

	it('gives the same view as building it for the selected ids', () => {
		const data = content();
		const all = buildCompareView(data, allIds, 'en', TODAY);
		for (const ids of [['f-uji'], ['fair-enough'], ['fair-enough', 'f-uji'], allIds, []]) {
			expect(selectCompareView(all, ids)).toEqual(buildCompareView(data, ids, 'en', TODAY));
		}
	});

	it('drops the rows that none of the selected tools records', () => {
		const all = buildCompareView(content(), allIds, 'en', TODAY);
		expect(all.rows.map((row) => row.key)).toContain('license');
		const only = selectCompareView(all, ['fair-enough']);
		expect(only.rows.map((row) => row.key)).not.toContain('license');
	});

	it('ignores ids that are not in the view', () => {
		const all = buildCompareView(content(), allIds, 'es', TODAY);
		expect(selectCompareView(all, ['nope', 'f-uji']).columns.map((column) => column.id)).toEqual([
			'f-uji'
		]);
	});

	it('does not change the view it is given', () => {
		const all = buildCompareView(content(), allIds, 'en', TODAY);
		const before = structuredClone(all);
		selectCompareView(all, ['f-uji']);
		expect(all).toEqual(before);
	});
});

describe('buildComparePage', () => {
	it('lists the sections that hold tools, with only the tools, in home order', () => {
		const page = buildComparePage(content(), 'en', TODAY);
		expect(page.sections).toEqual([
			{
				id: 'datasets',
				title: 'Dataset assessment tools',
				tools: [
					{ id: 'f-uji', name: 'F-UJI' },
					{ id: 'fair-enough', name: 'FAIR Enough' }
				]
			}
		]);
	});

	it('localizes the section titles and the caveats', () => {
		const data = content();
		const en = buildComparePage(data, 'en', TODAY);
		const es = buildComparePage(data, 'es', TODAY);
		expect(es.sections[0].title).toBe('Herramientas de evaluación de conjuntos de datos');
		expect(es.caveats).toEqual(data.caveats.map((item) => item.text.es));
		expect(en.caveats).toEqual(data.caveats.map((item) => item.text.en));
		expect(en.caveats.length).toBeGreaterThan(0);
	});

	it('carries one view with a column for every comparable tool, and the maximum', () => {
		const page = buildComparePage(content(), 'en', TODAY);
		expect(page.max).toBe(COMPARE_MAX);
		expect(page.view).toEqual(buildCompareView(content(), ['f-uji', 'fair-enough'], 'en', TODAY));
	});

	it('leaves frameworks, directories and guides out of the view', () => {
		const page = buildComparePage(content(), 'en', TODAY);
		const ids = page.view.columns.map((column) => column.id);
		expect(ids).not.toContain('fairsfair-metrics');
		expect(ids).not.toContain('fair-catalogue');
	});
});
