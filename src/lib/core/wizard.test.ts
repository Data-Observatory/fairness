import { describe, expect, it } from 'vitest';
import {
	matchingToolIds,
	optionCounts,
	parseWizardQuery,
	setAnswer,
	switchLevel,
	wizardFallback,
	wizardStateToQuery,
	type WizardConfig,
	type WizardState,
	type WizardTool
} from './wizard';

// Pure state and matching logic of the guided finder (specs 5.7). No Svelte, no content loader.

const config: WizardConfig = {
	levels: {
		simple: ['target', 'input'],
		advanced: ['target', 'input', 'mode', 'api']
	},
	options: {
		target: ['dataset', 'ontology', 'software'],
		input: ['doi', 'landing_page_url', 'none'],
		mode: ['automated', 'manual'],
		api: ['yes']
	}
};

const tools: WizardTool[] = [
	{
		id: 'a',
		fields: {
			target: ['dataset', 'software'],
			input: ['doi', 'landing_page_url'],
			mode: ['automated'],
			api: ['yes']
		}
	},
	{
		id: 'b',
		fields: { target: ['dataset'], input: ['doi'], mode: ['automated'], api: [] }
	},
	{ id: 'c', fields: { target: ['dataset'], input: ['none'], mode: ['manual'], api: [] } },
	{ id: 'd', fields: { target: ['ontology'], input: ['doi'], mode: ['automated'], api: ['yes'] } },
	// framework or directory: no target, input or mode
	{ id: 'e', fields: { target: [], input: [], mode: [], api: [] } }
];

const q = (query: string) => new URLSearchParams(query);

describe('matchingToolIds', () => {
	it('returns every tool, in order, when nothing is answered', () => {
		expect(matchingToolIds(tools, {})).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('ignores empty answers', () => {
		expect(matchingToolIds(tools, { target: [] })).toEqual(['a', 'b', 'c', 'd', 'e']);
	});

	it('is OR within a question', () => {
		expect(matchingToolIds(tools, { target: ['ontology', 'software'] })).toEqual(['a', 'd']);
	});

	it('is AND across questions', () => {
		expect(matchingToolIds(tools, { target: ['dataset'], input: ['doi'] })).toEqual(['a', 'b']);
		expect(matchingToolIds(tools, { target: ['dataset'], mode: ['manual'] })).toEqual(['c']);
	});

	it('a tool without a value never matches an answer to that question', () => {
		expect(matchingToolIds(tools, { input: ['doi', 'none', 'landing_page_url'] })).not.toContain(
			'e'
		);
		expect(matchingToolIds(tools, { api: ['yes'] })).toEqual(['a', 'd']);
	});

	it('returns an empty list when nothing fits', () => {
		expect(matchingToolIds(tools, { target: ['ontology'], mode: ['manual'] })).toEqual([]);
	});

	it('ignores answers for questions it does not know', () => {
		expect(matchingToolIds(tools, { color: ['red'] })).toEqual(['a', 'b', 'c', 'd', 'e']);
	});
});

describe('matchingToolIds with a known question list', () => {
	const sparse: WizardTool[] = [{ id: 'a', fields: { target: ['x'] } }];

	it('a tool with no key for a known question never matches an answer to it', () => {
		expect(matchingToolIds(sparse, { api: ['yes'] }, ['target', 'api'])).toEqual([]);
	});

	it('still ignores answers for questions that are not in the list', () => {
		expect(matchingToolIds(sparse, { color: ['red'] }, ['target', 'api'])).toEqual(['a']);
	});

	it('matches as before when the key is present', () => {
		expect(matchingToolIds(sparse, { target: ['x'] }, ['target', 'api'])).toEqual(['a']);
		expect(matchingToolIds(sparse, { target: ['y'] }, ['target', 'api'])).toEqual([]);
	});

	it('is used by optionCounts for the answers to the other questions', () => {
		expect(optionCounts(sparse, { api: ['yes'] }, 'target', ['x'], ['target', 'api'])).toEqual({
			x: 0
		});
	});
});

describe('optionCounts', () => {
	it('counts tools per option given the other answers, ignoring the question itself', () => {
		const counts = optionCounts(tools, { target: ['dataset'] }, 'input', [
			'doi',
			'landing_page_url',
			'none'
		]);
		expect(counts).toEqual({ doi: 2, landing_page_url: 1, none: 1 });
	});

	it('does not apply the answer of the counted question', () => {
		const counts = optionCounts(tools, { target: ['ontology'], input: ['none'] }, 'target', [
			'dataset',
			'ontology',
			'software'
		]);
		// input=none leaves only tool c (dataset); the own answer (target) is ignored
		expect(counts).toEqual({ dataset: 1, ontology: 0, software: 0 });
	});

	it('gives 0 for an option no tool has', () => {
		expect(optionCounts(tools, {}, 'mode', ['automated', 'manual', 'hybrid'])).toEqual({
			automated: 3,
			manual: 1,
			hybrid: 0
		});
	});
});

describe('parseWizardQuery', () => {
	it('defaults to simple, step 1, no answers', () => {
		expect(parseWizardQuery(q(''), config)).toEqual({ level: 'simple', answers: {}, step: 1 });
	});

	it('reads the advanced level', () => {
		expect(parseWizardQuery(q('level=advanced'), config).level).toBe('advanced');
	});

	it('treats an unknown level as simple', () => {
		expect(parseWizardQuery(q('level=expert'), config).level).toBe('simple');
	});

	it('reads answers, comma separated or repeated, sorted and de-duplicated, in advanced', () => {
		const state = parseWizardQuery(
			q('level=advanced&target=software,dataset&target=dataset'),
			config
		);
		expect(state.answers).toEqual({ target: ['dataset', 'software'] });
		expect(state.step).toBe('results');
	});

	it('drops unknown option ids and unknown questions', () => {
		const state = parseWizardQuery(
			q('level=advanced&target=dataset,nope&color=red&mode=automated'),
			config
		);
		expect(state.answers).toEqual({ target: ['dataset'], mode: ['automated'] });
	});

	it('keeps one value per question in simple', () => {
		const state = parseWizardQuery(q('target=software,dataset&step=2'), config);
		expect(state.answers.target).toHaveLength(1);
	});

	it('ignores questions that the simple level does not ask', () => {
		const state = parseWizardQuery(q('target=dataset&mode=automated&step=results'), config);
		expect(state.answers).toEqual({ target: ['dataset'] });
	});

	it('reads a numeric step within range and the word results', () => {
		expect(parseWizardQuery(q('step=2'), config).step).toBe(2);
		expect(parseWizardQuery(q('step=results'), config).step).toBe('results');
	});

	it.each(['0', '3', '-1', '1.5', 'abc', ''])('falls back for the invalid step "%s"', (value) => {
		expect(parseWizardQuery(q(`step=${value}`), config).step).toBe(1);
	});

	it('shows results for a shared link that has answers but no step', () => {
		expect(parseWizardQuery(q('target=dataset&input=doi'), config).step).toBe('results');
	});

	it('ignores step in advanced', () => {
		expect(parseWizardQuery(q('level=advanced&step=1'), config).step).toBe('results');
	});
});

describe('wizardStateToQuery', () => {
	const simple = (partial: Partial<WizardState>): WizardState => ({
		level: 'simple',
		answers: {},
		step: 1,
		...partial
	});

	it('is empty for the initial state', () => {
		expect(wizardStateToQuery(simple({}), config).toString()).toBe('');
	});

	it('writes the level only for advanced', () => {
		const state: WizardState = { level: 'advanced', answers: {}, step: 'results' };
		expect(wizardStateToQuery(state, config).toString()).toBe('level=advanced');
	});

	it('always writes the step in simple once something is answered', () => {
		const query = wizardStateToQuery(simple({ answers: { target: ['dataset'] }, step: 1 }), config);
		expect(query.get('step')).toBe('1');
		expect(query.get('target')).toBe('dataset');
	});

	it('writes step=results without answers (all steps skipped)', () => {
		expect(wizardStateToQuery(simple({ step: 'results' }), config).toString()).toBe('step=results');
	});

	it('writes answers in the order of the advanced level, values sorted', () => {
		const state: WizardState = {
			level: 'advanced',
			answers: { api: ['yes'], target: ['software', 'dataset'], mode: ['manual'] },
			step: 'results'
		};
		expect(decodeURIComponent(wizardStateToQuery(state, config).toString())).toBe(
			'level=advanced&target=dataset,software&mode=manual&api=yes'
		);
	});

	it('round-trips every kind of state', () => {
		const states: WizardState[] = [
			simple({}),
			simple({ step: 2, answers: { target: ['dataset'] } }),
			simple({ step: 'results', answers: { target: ['ontology'], input: ['doi'] } }),
			simple({ step: 'results' }),
			{ level: 'advanced', answers: {}, step: 'results' },
			{
				level: 'advanced',
				answers: { target: ['dataset', 'software'], mode: ['automated'], api: ['yes'] },
				step: 'results'
			}
		];
		for (const state of states) {
			expect(parseWizardQuery(wizardStateToQuery(state, config), config)).toEqual(state);
		}
	});
});

describe('setAnswer', () => {
	const start = (level: 'simple' | 'advanced'): WizardState => ({ level, answers: {}, step: 1 });

	it('replaces the value in simple', () => {
		let state = setAnswer(start('simple'), 'target', 'dataset', true);
		state = setAnswer(state, 'target', 'software', true);
		expect(state.answers).toEqual({ target: ['software'] });
	});

	it('adds and removes values in advanced', () => {
		let state = setAnswer(start('advanced'), 'target', 'dataset', true);
		state = setAnswer(state, 'target', 'software', true);
		expect(state.answers.target).toEqual(['dataset', 'software']);
		state = setAnswer(state, 'target', 'dataset', false);
		expect(state.answers.target).toEqual(['software']);
	});

	it('removes the question entry when its last value goes', () => {
		let state = setAnswer(start('advanced'), 'api', 'yes', true);
		state = setAnswer(state, 'api', 'yes', false);
		expect(state.answers).toEqual({});
	});

	it('does not mutate the previous state', () => {
		const before = start('advanced');
		setAnswer(before, 'target', 'dataset', true);
		expect(before.answers).toEqual({});
	});
});

describe('switchLevel', () => {
	it('advanced to simple keeps the first value of each simple question and drops the rest', () => {
		const state: WizardState = {
			level: 'advanced',
			answers: { target: ['dataset', 'software'], mode: ['manual'], input: ['doi'] },
			step: 'results'
		};
		expect(switchLevel(state, 'simple', config)).toEqual({
			level: 'simple',
			answers: { target: ['dataset'], input: ['doi'] },
			step: 'results'
		});
	});

	it('advanced to simple without answers starts at step 1', () => {
		const state: WizardState = { level: 'advanced', answers: {}, step: 'results' };
		expect(switchLevel(state, 'simple', config).step).toBe(1);
	});

	it('simple to advanced keeps the answers and shows everything', () => {
		const state: WizardState = { level: 'simple', answers: { target: ['dataset'] }, step: 2 };
		expect(switchLevel(state, 'advanced', config)).toEqual({
			level: 'advanced',
			answers: { target: ['dataset'] },
			step: 'results'
		});
	});

	it('switching to the current level changes nothing', () => {
		const state: WizardState = { level: 'simple', answers: { target: ['dataset'] }, step: 2 };
		expect(switchLevel(state, 'simple', config)).toEqual(state);
	});
});

describe('wizardFallback', () => {
	it('points at the finder table when it is shown', () => {
		expect(wizardFallback(true)).toEqual({ fragment: '#finder', variant: 'table' });
	});

	it('points at the plain home page and describes no table when it is off', () => {
		expect(wizardFallback(false)).toEqual({ fragment: '', variant: 'home' });
	});
});
