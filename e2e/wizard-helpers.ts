import { expect, type Locator, type Page } from '@playwright/test';
import { optionCount, optionIds, wizardMatches, type Answers } from './content';
import { wholeNumber } from './helpers';

// Locators, assertions and scenario search for the guided finder (/wizard). Question and option
// ids come from content/wizard.yaml and content/taxonomy.yaml at runtime, never from literals.

export const questionBox = (page: Page, id: string): Locator =>
	page.locator(`fieldset[data-testid=wizard-question][data-question-id=${id}]`);

export const radio = (page: Page, question: string, option: string): Locator =>
	questionBox(page, question).locator(`input[type=radio][name=${question}][value=${option}]`);

export const box = (page: Page, question: string, option: string): Locator =>
	questionBox(page, question).locator(`input[type=checkbox][name=${question}][value=${option}]`);

export const noPreference = (page: Page): Locator =>
	page.locator('[data-testid=wizard-no-preference]');

export const tid = (page: Page, id: string): Locator => page.locator(`[data-testid=${id}]`);

export const wizardCount = (page: Page): Locator =>
	page.getByRole('status').and(page.locator('[data-testid=wizard-result-count]'));

export const wizardCards = (page: Page): Locator =>
	page.locator('[data-testid=wizard-results] [data-testid=tool-card]');

export const wizardUrl = (locale: string, params: Record<string, string> = {}): string => {
	const query = new URLSearchParams(params).toString();
	return `/${locale}/wizard${query ? `?${query}` : ''}`;
};

/** Query string of a state: values of one question are comma separated and sorted. */
export function queryOf(
	answers: Answers,
	extra: Record<string, string> = {}
): Record<string, string> {
	const params: Record<string, string> = { ...extra };
	for (const [id, values] of Object.entries(answers)) {
		if (values.length > 0) params[id] = [...values].sort().join(',');
	}
	return params;
}

/** Waits until the given query parameters have exactly these values (null: absent). */
export async function expectQuery(
	page: Page,
	expected: Record<string, string | null>
): Promise<void> {
	await expect
		.poll(() => {
			const params = new URL(page.url()).searchParams;
			return Object.fromEntries(Object.keys(expected).map((key) => [key, params.get(key)]));
		})
		.toEqual(expected);
}

/** Results are exactly these tools, in this order (home order, never ranked). */
export async function expectResults(page: Page, expectedIds: string[]): Promise<void> {
	await expect(wizardCount(page)).toContainText(wholeNumber(expectedIds.length));
	await expect
		.poll(() =>
			wizardCards(page).evaluateAll((nodes) =>
				nodes.map((node) => node.getAttribute('data-tool-id'))
			)
		)
		.toEqual(expectedIds);
	if (expectedIds.length === 0) {
		await expect(tid(page, 'wizard-no-results')).toBeVisible();
	} else {
		await expect(tid(page, 'wizard-no-results')).toBeHidden();
	}
	await expect(tid(page, 'caveats')).toBeVisible();
}

export const idsOf = (answers: Answers): string[] => wizardMatches(answers).map((tool) => tool.id);

/** Progress text "Question N of M" in any locale: the two numbers, in this order. */
export const progressPattern = (step: number, total: number): RegExp =>
	new RegExp(`(^|\\D)${step}\\D+${total}(\\D|$)`);

/** The first option of each question that still matches at least one tool, given earlier answers. */
export function firstOpenPath(questions: string[]): Answers {
	const answers: Answers = {};
	for (const id of questions) {
		const open = optionIds(id).find((option) => optionCount(answers, id, option) > 0);
		if (open) answers[id] = [open];
	}
	return answers;
}

/** Options of `question` that match at least one tool given `answers`. */
export const openOptions = (answers: Answers, question: string): string[] =>
	optionIds(question).filter((option) => optionCount(answers, question, option) > 0);

export type DisabledScenario = {
	/** The earlier answer. */
	answers: Answers;
	/** A later question and one of its options that no tool matches after that answer. */
	question: string;
	option: string;
};

/** An answer in an earlier question that leaves an option of a later question with no tool. */
export function findDisabledScenario(questions: string[]): DisabledScenario | undefined {
	for (const [index, first] of questions.entries()) {
		for (const firstOption of openOptions({}, first)) {
			const answers: Answers = { [first]: [firstOption] };
			for (const later of questions.slice(index + 1)) {
				const option = optionIds(later).find(
					(candidate) => optionCount(answers, later, candidate) === 0
				);
				if (option) return { answers, question: later, option };
			}
		}
	}
	return undefined;
}

/** Two single answers in different questions that no tool satisfies together, each alone does. */
export function findZeroPair(questions: string[]): Answers | undefined {
	for (const [index, first] of questions.entries()) {
		for (const firstOption of openOptions({}, first)) {
			for (const second of questions.slice(index + 1)) {
				for (const secondOption of openOptions({}, second)) {
					if (wizardMatches({ [first]: [firstOption], [second]: [secondOption] }).length === 0) {
						return { [first]: [firstOption], [second]: [secondOption] };
					}
				}
			}
		}
	}
	return undefined;
}

/**
 * Every option of every listed question is disabled exactly when no tool would match it given
 * the other answers (its own question's answer ignored).
 */
export async function expectDisabledState(
	page: Page,
	questions: string[],
	answers: Answers,
	kind: 'radio' | 'checkbox'
): Promise<void> {
	const control = kind === 'radio' ? radio : box;
	for (const question of questions) {
		for (const option of optionIds(question)) {
			const empty = optionCount(answers, question, option) === 0;
			const input = control(page, question, option);
			if (empty) {
				await expect(
					input,
					`${question}=${option} has no tool and must be disabled`
				).toBeDisabled();
			} else {
				await expect(input, `${question}=${option} has tools and must be enabled`).toBeEnabled();
			}
		}
	}
}

/** Presses Tab until the focused element matches `selector` (at most `max` presses). */
export async function tabTo(page: Page, selector: string, max = 40): Promise<void> {
	for (let pressed = 0; pressed <= max; pressed++) {
		const focused = await page.evaluate(
			(sel) => document.activeElement?.matches(sel) ?? false,
			selector
		);
		if (focused) return;
		await page.keyboard.press('Tab');
	}
	throw new Error(`Tab never reached ${selector}`);
}

/** With a radio of a group focused, moves the selection with ArrowDown until `value` is selected. */
export async function arrowToValue(page: Page, value: string, max = 20): Promise<void> {
	for (let pressed = 0; pressed <= max; pressed++) {
		const current = await page.evaluate(() => {
			const element = document.activeElement as HTMLInputElement | null;
			return element?.type === 'radio' && element.checked ? element.value : null;
		});
		if (current === value) return;
		await page.keyboard.press('ArrowDown');
	}
	throw new Error(`ArrowDown never selected the radio with value "${value}"`);
}
