import { expect, test } from '@playwright/test';
import { expectNoSkippedHeadingLevels, expectRealPage } from './helpers';

test.describe('heading levels', () => {
	for (const url of ['/en', '/en/about', '/en/tools/f-uji']) {
		test(`${url} has one h1 and never skips a level`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			await expectNoSkippedHeadingLevels(page);
		});
	}

	test('the caveat box heading on /en/about is an h3 under its h2 section', async ({ page }) => {
		await page.goto('/en/about');
		const heading = page.locator('[data-testid=caveats]').locator('h1, h2, h3, h4, h5, h6').first();
		await expect(heading).toBeVisible();
		expect(await heading.evaluate((node) => node.tagName)).toBe('H3');
	});
});
