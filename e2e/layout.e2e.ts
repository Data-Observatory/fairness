import { expect, test, type Page } from '@playwright/test';
import { expandAllSections, expectRealPage } from './helpers';

const noHorizontalScroll = (page: Page) =>
	page.evaluate(() => ({
		scrollWidth: document.documentElement.scrollWidth,
		innerWidth: window.innerWidth
	}));

test.describe('mobile viewport 375x812', () => {
	test.use({ viewport: { width: 375, height: 812 } });

	for (const url of [
		'/en',
		'/es',
		'/en/about',
		'/en/tools/f-uji',
		'/en/wizard',
		'/en/wizard?level=advanced'
	]) {
		test(`${url} has no horizontal scroll`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			let { scrollWidth, innerWidth } = await noHorizontalScroll(page);
			expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

			if (url === '/en') {
				await expandAllSections(page);
				({ scrollWidth, innerWidth } = await noHorizontalScroll(page));
				expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
			}
		});
	}
});

test.describe('print', () => {
	for (const url of ['/en', '/es', '/en/tools/f-uji', '/en/wizard']) {
		test(`${url} hides the navigation and keeps the content`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			await expect(page.getByRole('navigation').first()).toBeVisible();

			await page.emulateMedia({ media: 'print' });
			await expect(page.locator('header').first()).toBeHidden();
			await expect(page.getByRole('navigation')).toHaveCount(0);
			await expect(page.locator('h1')).toBeVisible();
		});
	}
});
