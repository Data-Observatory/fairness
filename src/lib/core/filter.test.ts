import { describe, expect, it } from 'vitest';
import { filterTools, selectionFromQuery, selectionToQuery } from './filter';
import type { Tool } from './schema';

function tool(partial: Record<string, unknown> & { id: string }): Tool {
	return {
		kind: 'tool',
		section: 'datasets',
		name: partial.id,
		url: 'https://example.org/',
		operator: { name: 'Operator' },
		summary: { en: 's', es: 's' },
		status: 'available',
		last_verified: '2025-01-15',
		...partial
	} as unknown as Tool;
}

const alpha = tool({
	id: 'alpha',
	targets: ['dataset'],
	mode: 'automated',
	inputs: ['doi', 'landing_page_url'],
	frameworks: ['fairsfair_metrics'],
	status: 'available'
});
const beta = tool({
	id: 'beta',
	targets: ['dataset', 'software'],
	mode: 'manual',
	inputs: ['metadata_file'],
	status: 'limited'
});
const gamma = tool({
	id: 'gamma',
	targets: ['ontology'],
	mode: 'hybrid',
	inputs: ['ontology_uri', 'doi'],
	frameworks: ['custom', 'fairsfair_metrics'],
	status: 'unverified'
});
const framework = tool({
	id: 'a-framework',
	kind: 'framework',
	frameworks: ['rda_fdmm'],
	status: 'available'
});
const directory = tool({ id: 'a-directory', kind: 'directory', status: 'unverified' });

const all = [alpha, beta, gamma, framework, directory];
const ids = (tools: Tool[]) => tools.map((entry) => entry.id);

describe('filterTools: empty selections', () => {
	it('an empty selection returns every tool in the original order', () => {
		expect(ids(filterTools(all, {}))).toEqual(ids(all));
	});

	it('empty or missing groups impose no constraint', () => {
		expect(ids(filterTools(all, { target: [], mode: [], input: [] }))).toEqual(ids(all));
		expect(ids(filterTools(all, { target: undefined }))).toEqual(ids(all));
	});

	it('does not mutate its inputs and returns a new array', () => {
		const input = [...all];
		const selection = { mode: ['automated'] };
		const result = filterTools(input, selection);
		expect(input).toEqual(all);
		expect(selection).toEqual({ mode: ['automated'] });
		expect(result).not.toBe(input);
	});

	it('an empty tool list returns an empty list', () => {
		expect(filterTools([], { mode: ['automated'] })).toEqual([]);
	});
});

describe('filterTools: one group', () => {
	it('target matches when any of the tool targets is selected', () => {
		expect(ids(filterTools(all, { target: ['software'] }))).toEqual(['beta']);
		expect(ids(filterTools(all, { target: ['dataset'] }))).toEqual(['alpha', 'beta']);
	});

	it('mode matches the single mode value', () => {
		expect(ids(filterTools(all, { mode: ['manual'] }))).toEqual(['beta']);
	});

	it('input matches when any of the tool inputs is selected', () => {
		expect(ids(filterTools(all, { input: ['doi'] }))).toEqual(['alpha', 'gamma']);
	});

	it('framework matches when any implemented framework is selected', () => {
		expect(ids(filterTools(all, { framework: ['fairsfair_metrics'] }))).toEqual(['alpha', 'gamma']);
	});

	it('status matches the single status value', () => {
		expect(ids(filterTools(all, { status: ['unverified'] }))).toEqual(['gamma', 'a-directory']);
	});

	it('an id nothing uses yields an empty result', () => {
		expect(filterTools(all, { target: ['person_knowledge'] })).toEqual([]);
	});
});

describe('filterTools: OR within a group', () => {
	it('several values in one group widen the result', () => {
		expect(ids(filterTools(all, { mode: ['automated', 'manual'] }))).toEqual(['alpha', 'beta']);
		expect(ids(filterTools(all, { target: ['software', 'ontology'] }))).toEqual(['beta', 'gamma']);
	});

	it('a tool matching two selected values appears once', () => {
		expect(ids(filterTools(all, { target: ['dataset', 'software'] }))).toEqual(['alpha', 'beta']);
	});

	it('values are matched exactly, not as substrings', () => {
		expect(filterTools(all, { mode: ['auto'] })).toEqual([]);
	});
});

describe('filterTools: AND across groups', () => {
	it('every non-empty group must match', () => {
		expect(ids(filterTools(all, { target: ['dataset'], mode: ['automated'] }))).toEqual(['alpha']);
		expect(ids(filterTools(all, { target: ['dataset'], mode: ['hybrid'] }))).toEqual([]);
	});

	it('an empty group does not break a non-empty one', () => {
		expect(ids(filterTools(all, { target: ['dataset'], mode: [], status: ['limited'] }))).toEqual([
			'beta'
		]);
	});

	it('combines OR and AND', () => {
		const selection = { target: ['dataset', 'ontology'], status: ['available', 'unverified'] };
		expect(ids(filterTools(all, selection))).toEqual(['alpha', 'gamma']);
	});
});

describe('filterTools: framework and directory entries', () => {
	it('lacking a field they never match a non-empty selection on it', () => {
		expect(ids(filterTools(all, { target: ['dataset', 'ontology', 'software'] }))).toEqual([
			'alpha',
			'beta',
			'gamma'
		]);
		expect(ids(filterTools(all, { mode: ['automated', 'manual', 'hybrid'] }))).toEqual([
			'alpha',
			'beta',
			'gamma'
		]);
		expect(ids(filterTools(all, { input: ['doi', 'metadata_file', 'ontology_uri'] }))).toEqual([
			'alpha',
			'beta',
			'gamma'
		]);
	});

	it('a framework entry that has the field can match it', () => {
		expect(ids(filterTools(all, { framework: ['rda_fdmm'] }))).toEqual(['a-framework']);
	});

	it('they match on fields they do have, such as status', () => {
		expect(ids(filterTools(all, { status: ['available'] }))).toEqual(['alpha', 'a-framework']);
	});

	it('they are kept when only empty groups are given', () => {
		expect(ids(filterTools(all, { target: [] }))).toEqual(ids(all));
	});
});

describe('filterTools: unknown selection groups (decision 10)', () => {
	it('a group the tools know nothing about is ignored, not a filter-everything-out', () => {
		expect(ids(filterTools(all, { colour: ['blue'] }))).toEqual(ids(all));
	});

	it('unknown groups do not disturb known ones', () => {
		expect(ids(filterTools(all, { colour: ['blue'], mode: ['manual'] }))).toEqual(['beta']);
	});

	it('known groups still filter out everything when nothing matches', () => {
		expect(ids(filterTools(all, { colour: ['blue'], mode: ['psychic'] }))).toEqual([]);
	});
});

describe('selectionToQuery', () => {
	it('serialises groups as comma separated values', () => {
		const query = selectionToQuery({ mode: ['automated'], target: ['dataset', 'software'] });
		expect(query.get('mode')).toBe('automated');
		expect(query.get('target')).toBe('dataset,software');
	});

	it('omits empty and undefined groups', () => {
		const query = selectionToQuery({ mode: [], target: undefined, status: ['available'] });
		expect(query.has('mode')).toBe(false);
		expect(query.has('target')).toBe(false);
		expect(query.toString()).toBe('status=available');
	});

	it('an empty selection gives an empty query', () => {
		expect(selectionToQuery({}).toString()).toBe('');
	});

	it('is order-stable: groups in canonical order, values sorted and de-duplicated', () => {
		const a = selectionToQuery({
			status: ['limited'],
			target: ['software', 'dataset', 'dataset'],
			mode: ['manual']
		});
		const b = selectionToQuery({
			mode: ['manual'],
			target: ['dataset', 'software'],
			status: ['limited']
		});
		expect(a.toString()).toBe(b.toString());
		expect(a.toString()).toBe('target=dataset%2Csoftware&mode=manual&status=limited');
	});

	it('uses the canonical order target, mode, input, framework, status', () => {
		const query = selectionToQuery({
			status: ['a'],
			framework: ['b'],
			input: ['c'],
			mode: ['d'],
			target: ['e']
		});
		expect([...query.keys()]).toEqual(['target', 'mode', 'input', 'framework', 'status']);
	});

	it('does not mutate the selection', () => {
		const selection = { target: ['software', 'dataset'] };
		selectionToQuery(selection);
		expect(selection).toEqual({ target: ['software', 'dataset'] });
	});
});

describe('selectionFromQuery', () => {
	const groups = ['target', 'mode', 'input', 'framework', 'status'] as const;

	it('parses comma separated values', () => {
		const params = new URLSearchParams('mode=automated&target=dataset,software');
		expect(selectionFromQuery(params, groups)).toEqual({
			target: ['dataset', 'software'],
			mode: ['automated']
		});
	});

	it('merges repeated parameters', () => {
		const params = new URLSearchParams('target=dataset&target=software');
		expect(selectionFromQuery(params, groups)).toEqual({ target: ['dataset', 'software'] });
	});

	it('ignores unknown groups and unrelated parameters', () => {
		const params = new URLSearchParams('colour=blue&utm_source=x&mode=manual');
		expect(selectionFromQuery(params, groups)).toEqual({ mode: ['manual'] });
	});

	it('ignores groups that are not in allowedGroups', () => {
		const params = new URLSearchParams('mode=manual&status=limited');
		expect(selectionFromQuery(params, ['mode'])).toEqual({ mode: ['manual'] });
	});

	it('drops empty values and omits empty groups', () => {
		const params = new URLSearchParams('target=&mode=,,manual,&input=');
		expect(selectionFromQuery(params, groups)).toEqual({ mode: ['manual'] });
	});

	it('sorts and de-duplicates values', () => {
		const params = new URLSearchParams('target=software,dataset,dataset');
		expect(selectionFromQuery(params, groups)).toEqual({ target: ['dataset', 'software'] });
	});

	it('an empty query gives an empty selection', () => {
		expect(selectionFromQuery(new URLSearchParams(), groups)).toEqual({});
	});
});

describe('query round trip', () => {
	const groups = ['target', 'mode', 'input', 'framework', 'status'] as const;
	const selections = [
		{},
		{ mode: ['automated'] },
		{ target: ['dataset', 'software'], status: ['available', 'limited'] },
		{
			target: ['dataset'],
			mode: ['hybrid'],
			input: ['doi', 'metadata_url'],
			framework: ['fairsfair_metrics'],
			status: ['unverified']
		}
	];

	it.each(selections.map((selection) => [JSON.stringify(selection), selection] as const))(
		'selection %s survives to query and back',
		(_label, selection) => {
			const back = selectionFromQuery(selectionToQuery(selection), groups);
			expect(back).toEqual(selection);
		}
	);

	it('query to selection to query is the identity for canonical queries', () => {
		const canonical = 'target=dataset%2Csoftware&mode=manual&status=limited';
		const selection = selectionFromQuery(new URLSearchParams(canonical), groups);
		expect(selectionToQuery(selection).toString()).toBe(canonical);
	});

	it('a non-canonical query normalises to the canonical one', () => {
		const params = new URLSearchParams('status=limited&mode=manual&target=software,dataset');
		const selection = selectionFromQuery(params, groups);
		expect(selectionToQuery(selection).toString()).toBe(
			'target=dataset%2Csoftware&mode=manual&status=limited'
		);
	});

	it('the filtered result is the same before and after the round trip', () => {
		const selection = { target: ['dataset'], mode: ['automated', 'manual'] };
		const back = selectionFromQuery(selectionToQuery(selection), groups);
		expect(ids(filterTools(all, back))).toEqual(ids(filterTools(all, selection)));
	});
});

describe('selectionFromQuery: allowedValues (third argument)', () => {
	const groups = ['target', 'mode', 'input', 'framework', 'status'] as const;
	const allowed = {
		target: ['dataset', 'ontology'],
		mode: ['automated', 'manual', 'hybrid'],
		input: ['doi'],
		framework: ['custom'],
		status: ['available']
	};

	it('drops ids that are not in allowedValues and keeps the known ones', () => {
		const params = new URLSearchParams('target=ontology,bogus&mode=bogus');
		expect(selectionFromQuery(params, groups, allowed)).toEqual({ target: ['ontology'] });
	});

	it('omits a group when every id in it is unknown', () => {
		const params = new URLSearchParams('mode=bogus&status=gone');
		expect(selectionFromQuery(params, groups, allowed)).toEqual({});
	});

	it('applies to repeated parameters too', () => {
		const params = new URLSearchParams('mode=manual&mode=nope&mode=hybrid');
		expect(selectionFromQuery(params, groups, allowed)).toEqual({ mode: ['hybrid', 'manual'] });
	});

	it('still sorts, de-duplicates and respects allowedGroups', () => {
		const params = new URLSearchParams('target=ontology,dataset,dataset&mode=manual');
		expect(selectionFromQuery(params, ['target'], allowed)).toEqual({
			target: ['dataset', 'ontology']
		});
	});

	it('is case sensitive: ids come from the taxonomy as written', () => {
		const params = new URLSearchParams('mode=Manual');
		expect(selectionFromQuery(params, groups, allowed)).toEqual({});
	});

	it('the two-argument form keeps every id (old behaviour)', () => {
		const params = new URLSearchParams('mode=bogus');
		expect(selectionFromQuery(params, groups)).toEqual({ mode: ['bogus'] });
	});
});
