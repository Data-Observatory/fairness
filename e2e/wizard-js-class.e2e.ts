import { expect, test } from '@playwright/test';
import { LOCALES } from './content';
import { tid, wizardUrl } from './wizard-helpers';

// The no-JavaScript box is part of the prerendered HTML. An inline script in app.html adds the
// class `js` to the root element, and the stylesheet hides the box under it, so visitors with
// JavaScript never see it flash before hydration (specs 6 and 19).

for (const locale of LOCALES) {
	test.describe(`wizard /${locale}: no-JavaScript box and the js class`, () => {
		test('the prerendered HTML carries the box and the inline script', async ({ request }) => {
			const response = await request.get(wizardUrl(locale));
			expect(response.ok()).toBe(true);
			const html = await response.text();
			expect(html).toContain('data-testid="wizard-noscript"');
			expect(html).toMatch(/classList\.add\(['"]js['"]\)/);
		});

		test('with JavaScript the root element has the class js', async ({ page }) => {
			await page.goto(wizardUrl(locale));
			await expect(page.locator('html')).toHaveClass(/(^|\s)js(\s|$)/);
		});

		test('with JavaScript but before hydration the box is in the page and hidden', async ({
			page
		}) => {
			await page.route('**/_app/**/*.js', (route) => route.abort());
			await page.goto(wizardUrl(locale), { waitUntil: 'domcontentloaded' });
			await expect(page.locator('html')).toHaveClass(/(^|\s)js(\s|$)/);
			await expect(tid(page, 'wizard-noscript')).toHaveCount(1);
			await expect(tid(page, 'wizard-noscript')).toBeHidden();
		});
	});
}

test.describe('wizard: JavaScript disabled', () => {
	test.use({ javaScriptEnabled: false });

	for (const locale of LOCALES) {
		test(`/${locale}: no js class, the box is visible`, async ({ page }) => {
			await page.goto(wizardUrl(locale));
			await expect(page.locator('html')).not.toHaveClass(/(^|\s)js(\s|$)/);
			await expect(tid(page, 'wizard-noscript')).toBeVisible();
		});
	}
});
