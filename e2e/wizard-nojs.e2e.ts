import { expect, test } from '@playwright/test';
import { LOCALES } from './content';
import { tid, wizardUrl } from './wizard-helpers';

// Without JavaScript the guided finder cannot run: the page says so and links to the finder
// table on the home page (specs section 6).

test.use({ javaScriptEnabled: false });

for (const locale of LOCALES) {
	test.describe(`wizard JavaScript disabled /${locale}`, () => {
		test('explains the limitation and shows no question controls', async ({ page }) => {
			await page.goto(wizardUrl(locale));
			await expect(page.locator('h1')).toHaveCount(1);
			await expect(page.locator('h1')).toBeVisible();
			await expect(tid(page, 'wizard-noscript')).toBeVisible();
			await expect(tid(page, 'wizard-noscript')).not.toBeEmpty();
			await expect(tid(page, 'caveats')).toBeVisible();

			await expect(tid(page, 'wizard-question')).toHaveCount(0);
			await expect(tid(page, 'wizard-next')).toHaveCount(0);
			await expect(tid(page, 'wizard-back')).toHaveCount(0);
			await expect(tid(page, 'wizard-no-preference')).toHaveCount(0);
			await expect(page.locator('main input')).toHaveCount(0);
		});

		test('links to the finder table on the home page', async ({ page }) => {
			await page.goto(wizardUrl(locale));
			const link = tid(page, 'wizard-noscript').locator('a[href$="#finder"]');
			await expect(link).toHaveCount(1);
			await expect(link).toBeVisible();
			await expect(link).toHaveAttribute('href', new RegExp(`/${locale}/?#finder$`));

			await link.click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/?#finder$`));
			await expect(page.locator('section#finder')).toBeVisible();
			await expect(page.locator('table[data-testid=finder-table]')).toBeVisible();
		});

		test('a shared URL with answers still shows the explanation, not an empty page', async ({
			page
		}) => {
			await page.goto(wizardUrl(locale, { level: 'advanced', target: 'dataset', input: 'doi' }));
			await expect(page.locator('h1')).toBeVisible();
			await expect(tid(page, 'wizard-noscript')).toBeVisible();
			await expect(tid(page, 'wizard-question')).toHaveCount(0);
		});
	});
}
