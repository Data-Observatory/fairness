import { expect, test } from '@playwright/test';
import { LOCALES, loadWizard } from './content';
import {
	expectResults,
	firstOpenPath,
	idsOf,
	queryOf,
	questionBox,
	tid,
	wizardUrl
} from './wizard-helpers';

// Focus management of the guided finder (specs 5.7 and 12): after every step change or level
// switch, focus lands on a real element, never on the body. Pointer clicks are used on purpose,
// the focus move must not depend on the previous focus position.

const levels = () => loadWizard().levels;

for (const locale of LOCALES) {
	test.describe(`wizard /${locale}: focus after navigation`, () => {
		test('Next moves focus to the next question', async ({ page }) => {
			const [first, second] = levels().simple;
			await page.goto(wizardUrl(locale));
			await expect(questionBox(page, first)).toBeVisible();
			await tid(page, 'wizard-next').click();
			await expect(questionBox(page, second)).toBeVisible();
			await expect(questionBox(page, second)).toBeFocused();
		});

		test('Back moves focus to the previous question', async ({ page }) => {
			const [first, second] = levels().simple;
			await page.goto(wizardUrl(locale, { step: '2' }));
			await expect(questionBox(page, second)).toBeVisible();
			await tid(page, 'wizard-back').click();
			await expect(questionBox(page, first)).toBeVisible();
			await expect(questionBox(page, first)).toBeFocused();
		});

		test('Show results moves focus to the results heading', async ({ page }) => {
			const simple = levels().simple;
			await page.goto(wizardUrl(locale, { step: String(simple.length) }));
			await expect(questionBox(page, simple[simple.length - 1])).toBeVisible();
			await tid(page, 'wizard-next').click();
			await expect(tid(page, 'wizard-results')).toBeVisible();
			await expect(page.locator('#wizard-results-title')).toBeFocused();
		});

		test('Change answers moves focus to the first question', async ({ page }) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			await expect(tid(page, 'wizard-results')).toBeVisible();
			await tid(page, 'wizard-edit').click();
			await expect(questionBox(page, simple[0])).toBeVisible();
			await expect(questionBox(page, simple[0])).toBeFocused();
		});

		test('Start over moves focus to the first question', async ({ page }) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			await expect(tid(page, 'wizard-results')).toBeVisible();
			await tid(page, 'wizard-restart').click();
			await expect(questionBox(page, simple[0])).toBeVisible();
			await expect(questionBox(page, simple[0])).toBeFocused();
		});

		test('the advanced level button of the results keeps focus on the page', async ({ page }) => {
			const answers = firstOpenPath(levels().simple);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			await expect(tid(page, 'wizard-results')).toBeVisible();
			await tid(page, 'wizard-change-level').focus();
			await expect(tid(page, 'wizard-change-level')).toBeFocused();
			await page.keyboard.press('Enter');

			await expect(tid(page, 'wizard-level-advanced')).toHaveAttribute('aria-pressed', 'true');
			await expect(tid(page, 'wizard-change-level')).toHaveCount(0);
			await expectResults(page, idsOf(answers));
			// The pressed button is gone: focus must not fall back to the body.
			await expect(tid(page, 'wizard-level-advanced')).toBeFocused();
			const onBody = await page.evaluate(() => document.activeElement === document.body);
			expect(onBody).toBe(false);
		});
	});

	test.describe(`wizard /${locale}: results count announcement`, () => {
		test('the results heading is described by the count', async ({ page }) => {
			const simple = levels().simple;
			const answers = firstOpenPath(simple);
			await page.goto(wizardUrl(locale, queryOf(answers, { step: 'results' })));
			const heading = page.locator('#wizard-results-title');
			await expect(heading).toBeVisible();
			const describedBy = await heading.getAttribute('aria-describedby');
			expect(describedBy, 'the heading must point at the count').toBeTruthy();
			const target = page.locator(`[id="${describedBy}"]`);
			await expect(target).toHaveCount(1);
			await expect(target).toHaveText(/\d/);
			await expect(target).toHaveAttribute('data-testid', 'wizard-result-count');
		});
	});
}
