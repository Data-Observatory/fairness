import type { WizardView } from './view.ts';

// Pure state and matching logic of the guided finder (specs 5.7). No Svelte, no content loader.

export type WizardLevel = 'simple' | 'advanced';

/** Answers per question id: the chosen option ids, sorted. A question without answer has no entry. */
export type WizardAnswers = Record<string, string[]>;

export type WizardState = {
	level: WizardLevel;
	answers: WizardAnswers;
	/** Simple level only: the 1-based question step, or the results. Advanced is always `results`. */
	step: number | 'results';
};

export type WizardConfig = {
	/** Question ids asked at each level, in display order. */
	levels: Record<WizardLevel, string[]>;
	/** Option ids per question id. */
	options: Record<string, string[]>;
};

export type WizardTool = {
	id: string;
	/** Option ids of the tool per question id. A tool without a value has an empty list. */
	fields: Record<string, string[]>;
};

const sorted = (values: Iterable<string>): string[] => [...new Set(values)].sort();

/**
 * The ids of the tools that fit the answers, in the order of `tools`: OR within, AND across.
 * `questions` lists the known question ids: an answer to one of them is always applied and a tool
 * without that key has no value, so it does not match (specs 5.7). Without it, the known ids are
 * the keys found in the tools and an answer to any other id is ignored.
 */
export function matchingToolIds(
	tools: readonly WizardTool[],
	answers: WizardAnswers,
	questions?: readonly string[]
): string[] {
	const known = new Set(questions ?? tools.flatMap((tool) => Object.keys(tool.fields)));
	const active = Object.entries(answers).filter(
		([question, values]) => values.length > 0 && known.has(question)
	);
	return tools
		.filter((tool) =>
			active.every(([question, values]) =>
				(tool.fields[question] ?? []).some((value) => values.includes(value))
			)
		)
		.map((tool) => tool.id);
}

/**
 * How many tools each option of `question` would leave, given the answers to the other
 * questions. The answer to `question` itself is not applied.
 */
export function optionCounts(
	tools: readonly WizardTool[],
	answers: WizardAnswers,
	question: string,
	optionIds: readonly string[],
	questions?: readonly string[]
): Record<string, number> {
	const others = Object.fromEntries(Object.entries(answers).filter(([id]) => id !== question));
	const remaining = new Set(matchingToolIds(tools, others, questions));
	const counts: Record<string, number> = Object.fromEntries(optionIds.map((id) => [id, 0]));
	for (const tool of tools) {
		if (!remaining.has(tool.id)) continue;
		for (const id of optionIds) {
			if (tool.fields[question]?.includes(id)) counts[id] += 1;
		}
	}
	return counts;
}

function answersOf(params: URLSearchParams, config: WizardConfig, level: WizardLevel) {
	const answers: WizardAnswers = {};
	for (const question of config.levels[level]) {
		const allowed = config.options[question] ?? [];
		const values = sorted(
			params
				.getAll(question)
				.flatMap((value) => value.split(','))
				.map((value) => value.trim())
				.filter((value) => allowed.includes(value))
		);
		// One value per question in the simple level.
		const kept = level === 'simple' ? values.slice(0, 1) : values;
		if (kept.length > 0) answers[question] = kept;
	}
	return answers;
}

/** Reads the state from a query string. Unknown or out of range values fall back, never throw. */
export function parseWizardQuery(params: URLSearchParams, config: WizardConfig): WizardState {
	const level: WizardLevel = params.get('level') === 'advanced' ? 'advanced' : 'simple';
	const answers = answersOf(params, config, level);
	if (level === 'advanced') return { level, answers, step: 'results' };

	const raw = params.get('step');
	if (raw === 'results') return { level, answers, step: 'results' };
	if (raw !== null && /^\d+$/.test(raw)) {
		const step = Number(raw);
		if (step >= 1 && step <= config.levels.simple.length) return { level, answers, step };
	}
	return { level, answers, step: Object.keys(answers).length > 0 ? 'results' : 1 };
}

/** Writes the state as a query string. `parseWizardQuery` reads back an equal state. */
export function wizardStateToQuery(state: WizardState, config: WizardConfig): URLSearchParams {
	const params = new URLSearchParams();
	if (state.level === 'advanced') params.set('level', 'advanced');
	else if (state.step !== 1 || Object.keys(state.answers).length > 0) {
		params.set('step', String(state.step));
	}
	for (const question of config.levels[state.level]) {
		const values = state.answers[question];
		if (values && values.length > 0) params.set(question, sorted(values).join(','));
	}
	return params;
}

/**
 * Sets or clears one option. Simple: a single choice per question (checking replaces).
 * Advanced: multiple choice. A question without values has no entry. Returns a new state.
 */
export function setAnswer(
	state: WizardState,
	question: string,
	option: string,
	checked: boolean
): WizardState {
	const current = state.answers[question] ?? [];
	let next: string[];
	if (state.level === 'simple') {
		next = checked ? [option] : current.filter((value) => value !== option);
	} else {
		next = checked ? sorted([...current, option]) : current.filter((value) => value !== option);
	}
	const answers = { ...state.answers };
	if (next.length > 0) answers[question] = next;
	else delete answers[question];
	return { ...state, answers };
}

/** Changes the level, keeping what still applies. Returns the same state for the current level. */
export function switchLevel(
	state: WizardState,
	level: WizardLevel,
	config: WizardConfig
): WizardState {
	if (state.level === level) return state;
	if (level === 'advanced') return { level, answers: { ...state.answers }, step: 'results' };

	const answers: WizardAnswers = {};
	for (const question of config.levels.simple) {
		const first = state.answers[question]?.[0];
		if (first !== undefined) answers[question] = [first];
	}
	return { level, answers, step: Object.keys(answers).length > 0 ? 'results' : 1 };
}

/** The matching configuration of a wizard view: levels and the option ids of each question. */
export function wizardConfigOf(view: WizardView): WizardConfig {
	return {
		levels: { simple: [...view.levels.simple], advanced: [...view.levels.advanced] },
		options: Object.fromEntries(
			view.questions.map((question) => [question.id, question.options.map((option) => option.id)])
		)
	};
}
