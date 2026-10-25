import { test } from '@playwright/test';
import { expandAllSections, expectNoA11yViolations, expectRealPage } from './helpers';

const PAGES = ['/en', '/es', '/en/about', '/es/about', '/en/tools/f-uji', '/es/tools/f-uji'];

test.describe('accessibility (WCAG 2.2 AA)', () => {
	for (const url of PAGES) {
		test(`${url} has no violations`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			await expectNoA11yViolations(page);
		});
	}

	for (const locale of ['en', 'es']) {
		test(`/${locale} has no violations with every section expanded and a filter selected`, async ({
			page
		}) => {
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await page
				.locator('fieldset[data-filter-group=mode] input[type=checkbox][value=automated]')
				.check();
			await expectNoA11yViolations(page);
		});
	}
});
