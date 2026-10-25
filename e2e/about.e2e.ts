import { expect, test } from '@playwright/test';
import { LOCALES, loadSite } from './content';

const site = loadSite();

for (const locale of LOCALES) {
	test.describe(`about /${locale}`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(`/${locale}/about`);
		});

		test('has one h1 and several section headings', async ({ page }) => {
			await expect(page.locator('h1')).toHaveCount(1);
			await expect(page.locator('h1')).not.toBeEmpty();
			expect(await page.getByRole('heading', { level: 2 }).count()).toBeGreaterThanOrEqual(3);
		});

		test('links to the contribute url from site.yaml', async ({ page }) => {
			await expect(page.locator('main').locator(`a[href="${site.contributeUrl}"]`)).not.toHaveCount(
				0
			);
		});

		test('states the privacy statement with the word cookies', async ({ page }) => {
			await expect(
				page
					.locator('main p')
					.filter({ hasText: /cookies/i })
					.first()
			).toBeVisible();
		});

		test('shows the caveats', async ({ page }) => {
			await expect(page.locator('[data-testid=caveats]')).toBeVisible();
		});
	});
}
