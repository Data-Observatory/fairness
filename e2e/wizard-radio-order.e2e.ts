import { expect, test } from '@playwright/test';
import { LOCALES, loadWizard } from './content';
import { questionBox, wizardUrl } from './wizard-helpers';

// WebKit does not wrap around when ArrowDown is pressed on the last radio of a group, while
// Chromium and Firefox do. The default choice ("No preference") is the checked radio that Tab
// lands on, so it must come first: ArrowDown then reaches the answers in every engine.

for (const locale of LOCALES) {
	test.describe(`wizard /${locale}: radio order`, () => {
		for (const id of loadWizard().levels.simple) {
			test(`"No preference" is the first radio of ${id} and is checked by default`, async ({
				page
			}) => {
				await page.goto(wizardUrl(locale, `step=${loadWizard().levels.simple.indexOf(id) + 1}`));
				await expect(questionBox(page, id)).toBeVisible();
				const radios = questionBox(page, id).locator('input[type=radio]');
				await expect(radios.first()).toHaveAttribute('data-testid', 'wizard-no-preference');
				await expect(radios.first()).toBeChecked();
				expect(await radios.count()).toBeGreaterThan(1);
			});
		}
	});
}
