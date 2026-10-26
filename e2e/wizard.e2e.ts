import { expect, test, type Page } from '@playwright/test';
import {
	LOCALES,
	loadSite,
	loadTools,
	loadWizard,
	optionIds,
	optionLabel,
	type Answers,
	type Locale
} from './content';
import { cardFor, wholeNumber } from './helpers';
import {
	arrowToValue,
	box,
	expectDisabledState,
	expectQuery,
	expectResults,
	findDisabledScenario,
	findZeroPair,
	firstOpenPath,
	idsOf,
	noPreference,
	openOptions,
	progressPattern,
	queryOf,
	questionBox,
	radio,
	tabTo,
	tid,
	wizardCards,
	wizardCount,
	wizardUrl
} from './wizard-helpers';

// Guided finder (/wizard): simple and advanced levels, query string as state (specs 5.7 and 6).
// Question and option ids are read from content at runtime and the expected results are computed
// with the spec rule: OR within a question, AND across questions, a tool with no recorded value
// never matches that question, api and self_hostable match only when the tool value is true.

const site = loadSite();
const tools = loadTools();

const levels = () => loadWizard().levels;

/** Selects a radio of the simple level and waits until it is checked. */
async function choose(page: Page, question: string, option: string): Promise<void> {
	await radio(page, question, option).check();
	await expect(radio(page, question, option)).toBeChecked();
}

async function next(page: Page): Promise<void> {
	await tid(page, 'wizard-next').click();
}

for (const locale of LOCALES) {
	test.describe(`wizard /${locale}: page`, () => {
		test('has one h1, the caveat box, the level switch and the right language', async ({
			page
		}) => {
			await page.goto(wizardUrl(locale));
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			await expect(page.locator('h1')).toHaveCount(1);
			await expect(page.locator('h1')).toBeVisible();
			await expect(page.locator('h1')).not.toBeEmpty();
			await expect(tid(page, 'caveats')).toBeVisible();
			await expect(tid(page, 'wizard-level-simple')).toHaveAttribute('aria-pressed', 'true');
			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'false');
		});

		test('the navigation links to the page and marks it active only when the feature is on', async ({
			page
		}) => {
			await page.goto(wizardUrl(locale));
			const link = page.locator(`header nav a[href*="/wizard"]:not([data-testid^=locale-switch])`);
			await expect(link).toHaveCount(site.features.wizard ? 1 : 0);
			if (site.features.wizard) {
				await expect(link).toHaveAttribute('href', new RegExp(`^/${locale}/wizard/?$`));
				await expect(link).toHaveAttribute('aria-current', 'page');
			}
		});

		test('the page loads without console errors or failed requests through a full flow', async ({
			page
		}) => {
			const problems: string[] = [];
			page.on('console', (message) => {
				if (message.type() === 'error') problems.push(`console: ${message.text()}`);
			});
			page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
			page.on('requestfailed', (request) => problems.push(`requestfailed: ${request.url()}`));
			page.on('response', (response) => {
				if (response.status() >= 400)
					problems.push(`status ${response.status()}: ${response.url()}`);
			});

			await page.goto(wizardUrl(locale));
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			for (const id of simple) {
				if (answers[id]) await choose(page, id, answers[id][0]);
				await next(page);
			}
			await expectResults(page, idsOf(answers));
			await tid(page, 'wizard-level-advanced').click();
			await expectResults(page, idsOf(answers));
			await page.waitForLoadState('networkidle');
			expect(problems).toEqual([]);
		});
	});

	test.describe(`wizard /${locale}: simple level`, () => {
		test('shows one question at a time with a legend, radios and a default no-preference', async ({
			page
		}) => {
			const simple = levels().simple;
			expect(simple.length).toBeGreaterThanOrEqual(2);
			await page.goto(wizardUrl(locale));

			const first = simple[0];
			await expect(tid(page, 'wizard-question')).toHaveCount(1);
			await expect(questionBox(page, first)).toBeVisible();
			await expect(questionBox(page, first).locator('legend')).toHaveCount(1);
			await expect(questionBox(page, first).locator('legend')).not.toBeEmpty();
			await expect(questionBox(page, first)).toContainText(
				loadWizard().questions.find((item) => item.id === first)!.question[locale]
			);
			for (const option of optionIds(first)) {
				await expect(radio(page, first, option)).toHaveCount(1);
			}
			await expect(noPreference(page)).toHaveCount(1);
			await expect(noPreference(page)).toHaveAttribute('type', 'radio');
			await expect(noPreference(page)).toHaveAttribute('value', '');
			await expect(noPreference(page)).toBeChecked();
			await expect(noPreference(page)).toBeEnabled();

			await expect(tid(page, 'wizard-progress')).toContainText(progressPattern(1, simple.length));
			await expect(tid(page, 'wizard-back')).toHaveCount(0);
			await expect(tid(page, 'wizard-next')).toBeVisible();
			await expect(tid(page, 'wizard-results')).toBeHidden();
			await expect(tid(page, 'caveats')).toBeVisible();
			// The advanced-only controls are not rendered in simple.
			await expect(page.locator('input[type=checkbox]')).toHaveCount(0);
		});

		test('answers every question and shows the matching tools in home order', async ({ page }) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			const expected = idsOf(answers);
			expect(Object.keys(answers)).toEqual(simple);
			expect(expected.length).toBeGreaterThan(0);
			expect(expected.length).toBeLessThan(tools.length);

			await page.goto(wizardUrl(locale));
			const firstLabel = await tid(page, 'wizard-next').innerText();
			for (const [index, id] of simple.entries()) {
				await expect(tid(page, 'wizard-progress')).toContainText(
					progressPattern(index + 1, simple.length)
				);
				await expect(questionBox(page, id)).toBeVisible();
				await choose(page, id, answers[id][0]);
				await expectQuery(page, { [id]: answers[id][0], step: String(index + 1) });
				if (index === simple.length - 1) {
					await expect(tid(page, 'wizard-next')).not.toHaveText(firstLabel);
				}
				await next(page);
			}

			await expect(tid(page, 'wizard-question')).toHaveCount(0);
			await expect(tid(page, 'wizard-restart')).toBeVisible();
			await expectQuery(page, { ...queryOf(answers), step: 'results' });
			await expectResults(page, expected);
			await expect(tid(page, 'wizard-results')).toBeVisible();
			// The results use the same cards as the home page.
			await expect(wizardCards(page).first().locator('[data-testid=open-tool]')).toHaveAttribute(
				'href',
				tools.find((tool) => tool.id === expected[0])!.url
			);
		});

		test('a question can be skipped: no preference leaves it out of the matching and the URL', async ({
			page
		}) => {
			const simple = levels().simple;
			expect(simple.length).toBeGreaterThanOrEqual(2);
			const [firstId, secondId] = simple;
			const firstOption = openOptions({}, firstId)[0];
			const secondOption = openOptions({}, secondId)[0];
			const expected = idsOf({ [secondId]: [secondOption] });
			expect(expected.length).toBeLessThan(tools.length);

			await page.goto(wizardUrl(locale));
			// Answering and then choosing no preference removes the answer again.
			await choose(page, firstId, firstOption);
			await expectQuery(page, { [firstId]: firstOption });
			await noPreference(page).check();
			await expect(radio(page, firstId, firstOption)).not.toBeChecked();
			await expectQuery(page, { [firstId]: null });

			await next(page);
			await expect(questionBox(page, secondId)).toBeVisible();
			await expect(noPreference(page)).toBeChecked();
			await choose(page, secondId, secondOption);
			for (const rest of simple.slice(2)) {
				await next(page);
				await expect(questionBox(page, rest)).toBeVisible();
			}
			await next(page);

			await expectQuery(page, { [firstId]: null, [secondId]: secondOption, step: 'results' });
			await expectResults(page, expected);
		});

		test('skipping every question shows every tool', async ({ page }) => {
			await page.goto(wizardUrl(locale));
			for (let step = 0; step < levels().simple.length; step++) await next(page);
			await expectQuery(page, { step: 'results' });
			await expectResults(page, idsOf({}));
			await expect(wizardCount(page)).toContainText(wholeNumber(tools.length));
			for (const id of levels().simple) await expectQuery(page, { [id]: null });
		});

		test('Back returns to the previous question and keeps its answer', async ({ page }) => {
			const simple = levels().simple;
			const firstId = simple[0];
			const firstOption = openOptions({}, firstId)[0];
			await page.goto(wizardUrl(locale));
			await expect(tid(page, 'wizard-back')).toHaveCount(0);
			await choose(page, firstId, firstOption);
			await next(page);

			await expect(questionBox(page, simple[1])).toBeVisible();
			await expect(tid(page, 'wizard-progress')).toContainText(progressPattern(2, simple.length));
			await expect(tid(page, 'wizard-back')).toBeVisible();
			await expectQuery(page, { step: '2', [firstId]: firstOption });

			await tid(page, 'wizard-back').click();
			await expect(questionBox(page, firstId)).toBeVisible();
			await expect(tid(page, 'wizard-progress')).toContainText(progressPattern(1, simple.length));
			await expect(radio(page, firstId, firstOption)).toBeChecked();
			await expect(tid(page, 'wizard-back')).toHaveCount(0);
			await expectQuery(page, { step: '1', [firstId]: firstOption });
		});

		test('Restart clears every answer and returns to the first question', async ({ page }) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			await expectResults(page, idsOf(answers));

			await tid(page, 'wizard-restart').click();
			await expect(questionBox(page, simple[0])).toBeVisible();
			await expect(tid(page, 'wizard-progress')).toContainText(progressPattern(1, simple.length));
			await expect(noPreference(page)).toBeChecked();
			await expect(tid(page, 'wizard-results')).toBeHidden();
			await expect.poll(() => new URL(page.url()).searchParams.get('step') ?? '').toMatch(/^(1)?$/);
			for (const id of simple) await expectQuery(page, { [id]: null });
		});

		test('options with no matching tool are disabled and the others are enabled', async ({
			page
		}) => {
			const simple = levels().simple;
			const scenario = findDisabledScenario(simple);
			expect(
				scenario,
				'real content needs an answer that leaves a later option empty'
			).toBeDefined();
			const [firstId] = simple;

			await page.goto(wizardUrl(locale));
			// Step 1: no other answers, so an option is disabled when no tool has it at all.
			await expectDisabledState(page, [firstId], {}, 'radio');
			await expect(noPreference(page)).toBeEnabled();
			const disabledFirst = optionIds(firstId).filter(
				(option) => openOptions({}, firstId).indexOf(option) < 0
			);
			for (const option of disabledFirst) {
				await expect(radio(page, firstId, option)).toBeDisabled();
			}

			await choose(page, firstId, scenario!.answers[firstId][0]);
			await next(page);
			const laterIndex = simple.indexOf(scenario!.question);
			for (let index = 1; index < laterIndex; index++) await next(page);
			await expect(questionBox(page, scenario!.question)).toBeVisible();
			await expect(radio(page, scenario!.question, scenario!.option)).toBeDisabled();
			await expectDisabledState(page, [scenario!.question], scenario!.answers, 'radio');
			await expect(noPreference(page)).toBeEnabled();
		});

		test('a disabled option cannot be chosen', async ({ page }) => {
			const [firstId] = levels().simple;
			const empty = optionIds(firstId).find(
				(option) => openOptions({}, firstId).indexOf(option) < 0
			);
			expect(empty, 'real content needs a first-question option no tool has').toBeDefined();
			await page.goto(wizardUrl(locale));
			await expect(radio(page, firstId, empty!)).toBeDisabled();
			await radio(page, firstId, empty!).click({ force: true });
			await expect(radio(page, firstId, empty!)).not.toBeChecked();
			await expect(noPreference(page)).toBeChecked();
			await expectQuery(page, { [firstId]: null });
		});

		test('can be completed with the keyboard alone', async ({ page }) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			const expected = idsOf(answers);
			await page.goto(wizardUrl(locale));

			for (const [index, id] of simple.entries()) {
				await expect(questionBox(page, id)).toBeVisible();
				// Tab into the radio group of the current question (one tab stop), then use arrows.
				await tabTo(page, `fieldset[data-question-id=${id}] input[type=radio]`);
				await arrowToValue(page, answers[id][0]);
				await expect(radio(page, id, answers[id][0])).toBeChecked();
				await expectQuery(page, { [id]: answers[id][0] });
				await tabTo(page, '[data-testid=wizard-next]');
				await expect(tid(page, 'wizard-next')).toBeFocused();
				await page.keyboard.press('Enter');
				if (index < simple.length - 1) {
					await expect(tid(page, 'wizard-progress')).toContainText(
						progressPattern(index + 2, simple.length)
					);
				}
			}

			await expectResults(page, expected);
			await tabTo(page, '[data-testid=wizard-restart]');
			await expect(tid(page, 'wizard-restart')).toBeFocused();
			await page.keyboard.press('Enter');
			await expect(questionBox(page, simple[0])).toBeVisible();
		});

		test('the buttons of the level switch work with the keyboard', async ({ page }) => {
			await page.goto(wizardUrl(locale));
			await tid(page, 'wizard-level-advanced').focus();
			await page.keyboard.press('Enter');
			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'true');
			await expectQuery(page, { level: 'advanced' });
			await tid(page, 'wizard-level-simple').focus();
			await page.keyboard.press('Space');
			await expect(tid(page, 'wizard-level-simple')).toHaveAttribute('aria-pressed', 'true');
			await expectQuery(page, { level: null });
		});

		test('a result links to its details page', async ({ page }) => {
			const answers = firstOpenPath(levels().simple);
			const expected = idsOf(answers);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			await expectResults(page, expected);
			const id = expected[0];
			const tool = tools.find((item) => item.id === id)!;
			await cardFor(page, id).locator('[data-testid=tool-details]').click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/tools/${id}/?$`));
			await expect(page.locator('h1')).toContainText(tool.name);
			await expect(page.locator('dl[data-testid=tool-facts]')).toBeVisible();
		});
	});

	test.describe(`wizard /${locale}: advanced level`, () => {
		test('shows every question at once with checkboxes and no Next or Back', async ({ page }) => {
			const advanced = levels().advanced;
			await page.goto(wizardUrl(locale, { level: 'advanced' }));
			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'true');
			await expect(tid(page, 'wizard-level-simple')).toHaveAttribute('aria-pressed', 'false');
			await expect(tid(page, 'wizard-question')).toHaveCount(advanced.length);
			const ids = await tid(page, 'wizard-question').evaluateAll((nodes) =>
				nodes.map((node) => node.getAttribute('data-question-id'))
			);
			expect(ids).toEqual(advanced);
			for (const id of advanced) {
				await expect(questionBox(page, id).locator('legend')).toHaveCount(1);
				await expect(questionBox(page, id).locator('legend')).not.toBeEmpty();
				for (const option of optionIds(id)) {
					await expect(box(page, id, option)).toHaveCount(1);
				}
				await expect(questionBox(page, id).locator('input[type=radio]')).toHaveCount(0);
			}
			await expect(tid(page, 'wizard-next')).toHaveCount(0);
			await expect(tid(page, 'wizard-back')).toHaveCount(0);
			// Nothing answered: every tool is listed, and results are always visible.
			await expect(tid(page, 'wizard-results')).toBeVisible();
			await expectResults(page, idsOf({}));
			await expect(tid(page, 'caveats')).toBeVisible();
		});

		test('combines several options of one question (OR) and several questions (AND), live', async ({
			page
		}) => {
			const [first, second] = levels().advanced;
			const [a, b] = openOptions({}, first);
			expect(b, 'real content needs two options with tools in the first question').toBeDefined();
			await page.goto(wizardUrl(locale, { level: 'advanced' }));
			await expectResults(page, idsOf({}));

			await box(page, first, a).check();
			await expectResults(page, idsOf({ [first]: [a] }));
			await expectQuery(page, { level: 'advanced', [first]: a });

			await box(page, first, b).check();
			const both: Answers = { [first]: [a, b] };
			await expectResults(page, idsOf(both));
			await expect(box(page, first, a)).toBeChecked();
			await expectQuery(page, { [first]: [a, b].sort().join(',') });

			const c = openOptions(both, second)[0];
			await box(page, second, c).check();
			const all: Answers = { ...both, [second]: [c] };
			await expectResults(page, idsOf(all));
			await expectQuery(page, { [second]: c });
			expect(idsOf(all).length).toBeLessThan(idsOf(both).length);

			await box(page, first, b).uncheck();
			await expectResults(page, idsOf({ [first]: [a], [second]: [c] }));
			await box(page, first, a).uncheck();
			await box(page, second, c).uncheck();
			await expectResults(page, idsOf({}));
			await expectQuery(page, { level: 'advanced', [first]: null, [second]: null });
		});

		test('every question can be answered, including api and self_hostable when listed', async ({
			page
		}) => {
			await page.goto(wizardUrl(locale, { level: 'advanced' }));
			const answers: Answers = {};
			for (const id of levels().advanced) {
				const option = openOptions(answers, id)[0];
				if (!option) continue;
				const candidate: Answers = { ...answers, [id]: [option] };
				// Keep at least one result so the next question still has an enabled option.
				if (idsOf(candidate).length === 0) continue;
				await box(page, id, option).check();
				answers[id] = [option];
				await expectResults(page, idsOf(answers));
			}
			await expectQuery(page, queryOf(answers, { level: 'advanced' }));
		});

		test('disables the options that no tool would match, given the other answers', async ({
			page
		}) => {
			const advanced = levels().advanced;
			const scenario = findDisabledScenario(advanced);
			expect(scenario, 'real content needs an answer that leaves an option empty').toBeDefined();
			await page.goto(wizardUrl(locale, { level: 'advanced' }));
			await expectDisabledState(page, advanced, {}, 'checkbox');

			const [first] = Object.keys(scenario!.answers);
			await box(page, first, scenario!.answers[first][0]).check();
			await expect(box(page, scenario!.question, scenario!.option)).toBeDisabled();
			await expectDisabledState(page, advanced, scenario!.answers, 'checkbox');
			// The answered question keeps its own options enabled (its own answer is ignored).
			for (const option of openOptions({}, first)) {
				await expect(box(page, first, option)).toBeEnabled();
			}
		});

		test('shows the no-results message and a count of zero for an empty combination', async ({
			page
		}) => {
			const pair = findZeroPair(levels().advanced);
			expect(pair, 'real content needs a combination with no tool').toBeDefined();
			await page.goto(wizardUrl(locale, queryOf(pair!, { level: 'advanced' })));
			for (const [id, [option]] of Object.entries(pair!)) {
				await expect(box(page, id, option)).toBeChecked();
			}
			await expectResults(page, []);
			await expect(wizardCount(page)).toContainText(/(^|\D)0(\D|$)/);
			await expect(wizardCards(page)).toHaveCount(0);

			// Removing one of the two answers brings the results back.
			const [dropId, [dropOption]] = Object.entries(pair!)[0];
			await box(page, dropId, dropOption).uncheck();
			const rest: Answers = { ...pair! };
			delete rest[dropId];
			await expectResults(page, idsOf(rest));
			await expect(tid(page, 'wizard-no-results')).toBeHidden();
		});
	});

	test.describe(`wizard /${locale}: level switch and shared URLs`, () => {
		test('switching from simple to advanced keeps the answers', async ({ page }) => {
			const answers = firstOpenPath(levels().simple);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			await expectResults(page, idsOf(answers));

			await tid(page, 'wizard-level-advanced').click();
			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'true');
			await expect(tid(page, 'wizard-level-simple')).toHaveAttribute('aria-pressed', 'false');
			await expectQuery(page, { level: 'advanced', ...queryOf(answers) });
			for (const [id, [option]] of Object.entries(answers)) {
				await expect(box(page, id, option)).toBeChecked();
			}
			await expectResults(page, idsOf(answers));
		});

		test('switching from advanced to simple keeps the first value of each simple question', async ({
			page
		}) => {
			const simple = levels().simple;
			const [first] = simple;
			const [a, b] = openOptions({}, first);
			expect(b).toBeDefined();
			const [firstValue] = [a, b].sort();
			const other = levels().advanced.find((id) => !simple.includes(id));
			const advancedOnly = other ? openOptions({ [first]: [firstValue] }, other)[0] : undefined;
			const params: Record<string, string> = {
				level: 'advanced',
				// Reversed on purpose: the first value is the first in sorted order.
				[first]: [a, b].sort().reverse().join(',')
			};
			if (other && advancedOnly) params[other] = advancedOnly;

			await page.goto(wizardUrl(locale, params));
			await expect(box(page, first, a)).toBeChecked();
			await expect(box(page, first, b)).toBeChecked();

			await tid(page, 'wizard-level-simple').click();
			await expect(tid(page, 'wizard-level-simple')).toHaveAttribute('aria-pressed', 'true');
			await expectQuery(page, {
				level: null,
				[first]: firstValue,
				...(other ? { [other]: null } : {})
			});
			await expectResults(page, idsOf({ [first]: [firstValue] }));
		});

		test('an advanced answer set restored from the URL shows its boxes and results', async ({
			page
		}) => {
			const [first, second] = levels().advanced;
			const [a, b] = openOptions({}, first);
			const c = openOptions({ [first]: [a, b] }, second)[0];
			const answers: Answers = { [first]: [a, b], [second]: [c] };
			await page.goto(wizardUrl(locale, queryOf(answers, { level: 'advanced' })));
			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'true');
			for (const [id, values] of Object.entries(answers)) {
				for (const option of optionIds(id)) {
					const input = box(page, id, option);
					if (values.includes(option)) await expect(input).toBeChecked();
					else await expect(input).not.toBeChecked();
				}
			}
			await expectResults(page, idsOf(answers));

			await page.reload();
			await expect(box(page, first, a)).toBeChecked();
			await expectResults(page, idsOf(answers));
		});

		test('a simple URL with step=results shows the results and a summary of the answers', async ({
			page
		}) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			await expect(tid(page, 'wizard-level-simple')).toHaveAttribute('aria-pressed', 'true');
			await expect(tid(page, 'wizard-question')).toHaveCount(0);
			await expectResults(page, idsOf(answers));
			// The summary names each answered question and its option, in this locale.
			const main = page.locator('main');
			for (const id of simple) {
				const item = loadWizard().questions.find((entry) => entry.id === id)!;
				await expect(main).toContainText(item.question[locale]);
				await expect(main).toContainText(optionLabel(id, answers[id][0], locale));
			}

			await page.reload();
			await expectResults(page, idsOf(answers));
		});

		test('a simple URL with step=N opens that question with the earlier answers kept', async ({
			page
		}) => {
			const simple = levels().simple;
			const [firstId, secondId] = simple;
			const firstOption = openOptions({}, firstId)[0];
			await page.goto(wizardUrl(locale, { [firstId]: firstOption, step: '2' }));
			await expect(questionBox(page, secondId)).toBeVisible();
			await expect(tid(page, 'wizard-progress')).toContainText(progressPattern(2, simple.length));
			await tid(page, 'wizard-back').click();
			await expect(radio(page, firstId, firstOption)).toBeChecked();
		});

		test('a simple URL with the answers of the first question and step=1 restores the radio', async ({
			page
		}) => {
			const [firstId] = levels().simple;
			const firstOption = openOptions({}, firstId)[0];
			await page.goto(wizardUrl(locale, { [firstId]: firstOption, step: '1' }));
			await expect(radio(page, firstId, firstOption)).toBeChecked();
			await expect(noPreference(page)).not.toBeChecked();
		});

		test('a simple URL with no step but with answers shows the results', async ({ page }) => {
			const answers = firstOpenPath(levels().simple);
			await page.goto(wizardUrl(locale, queryOf(answers)));
			await expect(tid(page, 'wizard-question')).toHaveCount(0);
			await expectResults(page, idsOf(answers));
		});

		test('simple results survive the full round trip: answer, reload, share', async ({
			page,
			context
		}) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			await page.goto(wizardUrl(locale));
			for (const id of simple) {
				await choose(page, id, answers[id][0]);
				await next(page);
			}
			await expectResults(page, idsOf(answers));
			const shared = page.url();

			const other = await context.newPage();
			await other.goto(shared);
			await expectResults(other, idsOf(answers));
			await other.close();

			await page.reload();
			await expectResults(page, idsOf(answers));
		});
	});

	test.describe(`wizard /${locale}: invalid query values`, () => {
		test('unknown option ids and unknown questions are ignored in simple', async ({ page }) => {
			const [firstId, secondId] = levels().simple;
			const secondOption = openOptions({}, secondId)[0];
			await page.goto(
				wizardUrl(locale, {
					[firstId]: 'bogus',
					[secondId]: secondOption,
					color: 'red',
					step: 'results'
				})
			);
			await expectResults(page, idsOf({ [secondId]: [secondOption] }));
		});

		test('questions that the simple level does not ask are ignored in simple', async ({ page }) => {
			const simple = levels().simple;
			const advancedOnly = levels().advanced.find((id) => !simple.includes(id));
			expect(advancedOnly, 'real content needs an advanced-only question').toBeDefined();
			const answers = firstOpenPath(simple);
			const extra = optionIds(advancedOnly!)[0];
			await page.goto(
				wizardUrl(locale, queryOf(answers, { [advancedOnly!]: extra, step: 'results' }))
			);
			await expectResults(page, idsOf(answers));
		});

		test('an unknown level falls back to simple', async ({ page }) => {
			await page.goto(wizardUrl(locale, { level: 'expert' }));
			await expect(tid(page, 'wizard-level-simple')).toHaveAttribute('aria-pressed', 'true');
			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'false');
			await expect(questionBox(page, levels().simple[0])).toBeVisible();
		});

		test('an invalid step falls back to the first question', async ({ page }) => {
			for (const step of ['0', '99', '-1', 'abc']) {
				await page.goto(wizardUrl(locale, { step }));
				await expect(questionBox(page, levels().simple[0])).toBeVisible();
				await expect(tid(page, 'wizard-progress')).toContainText(
					progressPattern(1, levels().simple.length)
				);
			}
		});

		test('unknown option ids are ignored in advanced and the known ones stay checked', async ({
			page
		}) => {
			const [first] = levels().advanced;
			const [a] = openOptions({}, first);
			await page.goto(
				wizardUrl(locale, { level: 'advanced', [first]: `${a},bogus`, color: 'red' })
			);
			await expect(box(page, first, a)).toBeChecked();
			await expectResults(page, idsOf({ [first]: [a] }));

			await page.goto(wizardUrl(locale, { level: 'advanced', [first]: 'bogus' }));
			for (const option of optionIds(first)) {
				await expect(box(page, first, option)).not.toBeChecked();
			}
			await expectResults(page, idsOf({}));
			await expect(tid(page, 'wizard-no-results')).toBeHidden();
		});
	});

	test.describe(`wizard /${locale}: zero results and locale switch`, () => {
		test('a simple URL with an empty combination shows the no-results message', async ({
			page
		}) => {
			const pair = findZeroPair(levels().simple);
			expect(pair, 'real content needs a simple combination with no tool').toBeDefined();
			await page.goto(wizardUrl(locale, queryOf(pair!, { step: 'results' })));
			await expectResults(page, []);
			await expect(wizardCount(page)).toContainText(/(^|\D)0(\D|$)/);
			await expect(wizardCards(page)).toHaveCount(0);
			await expect(tid(page, 'wizard-restart')).toBeVisible();

			await tid(page, 'wizard-restart').click();
			await expect(questionBox(page, levels().simple[0])).toBeVisible();
		});

		test('the locale switch keeps the query string', async ({ page }) => {
			const other: Locale = locale === 'en' ? 'es' : 'en';
			const [first, second] = levels().advanced;
			const [a] = openOptions({}, first);
			const c = openOptions({ [first]: [a] }, second)[0];
			const answers: Answers = { [first]: [a], [second]: [c] };
			const params = queryOf(answers, { level: 'advanced' });

			await page.goto(wizardUrl(locale, params));
			const link = page.locator(`[data-testid=locale-switch-${other}]`);
			await expect
				.poll(async () => {
					const url = new URL((await link.getAttribute('href')) ?? '', 'http://localhost');
					return [url.pathname.replace(/\/$/, ''), Object.fromEntries(url.searchParams)];
				})
				.toEqual([`/${other}/wizard`, params]);

			await link.click();
			await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === `/${other}/wizard`);
			await expect(page.locator('html')).toHaveAttribute('lang', other);
			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'true');
			await expect(box(page, first, a)).toBeChecked();
			await expect(box(page, second, c)).toBeChecked();
			await expectResults(page, idsOf(answers));
		});

		test('the locale switch follows an answer given after load in simple', async ({ page }) => {
			const other: Locale = locale === 'en' ? 'es' : 'en';
			const [firstId] = levels().simple;
			const option = openOptions({}, firstId)[0];
			await page.goto(wizardUrl(locale));
			await choose(page, firstId, option);
			await expect
				.poll(async () => {
					const href = await page
						.locator(`[data-testid=locale-switch-${other}]`)
						.getAttribute('href');
					return new URL(href ?? '', 'http://localhost').searchParams.get(firstId);
				})
				.toBe(option);

			await page.locator(`[data-testid=locale-switch-${other}]`).click();
			await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === `/${other}/wizard`);
			await expect(radio(page, firstId, option)).toBeChecked();
			await expect(tid(page, 'wizard-progress')).toContainText(
				progressPattern(1, levels().simple.length)
			);
		});
	});
}
