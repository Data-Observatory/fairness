import { test } from '@playwright/test';
import { expectNoA11yViolations, expectRealPage } from './helpers';

test.describe('axe: root redirect', () => {
	test('/ after the redirect has no violations', async ({ page }) => {
		await page.goto('/');
		await page.waitForURL((url) => /^\/(en|es)\/?$/.test(url.pathname));
		await expectRealPage(page, new URL(page.url()).pathname);
		await expectNoA11yViolations(page);
	});
});

test.describe('axe at 375x812', () => {
	test.use({ viewport: { width: 375, height: 812 } });

	for (const url of ['/en', '/es', '/en/tools/fair-enough', '/es/tools/fair-enough']) {
		test(`${url} has no violations`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			await expectNoA11yViolations(page);
		});
	}

	test('/en?mode=manual has no violations with the filter panel open', async ({ page }) => {
		await page.goto('/en?mode=manual');
		await expectRealPage(page, '/en');
		const panel = page.locator('[data-testid=filter-bar] details');
		if (!(await panel.evaluate((node) => (node as HTMLDetailsElement).open))) {
			await panel.locator('> summary').click();
		}
		await expectNoA11yViolations(page);
	});
});

test.describe('axe on detail pages with a status note (desktop)', () => {
	for (const url of ['/en/tools/fair-enough', '/es/tools/fair-enough']) {
		test(`${url} has no violations`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			await expectNoA11yViolations(page);
		});
	}
});

test.describe('axe with the filter panel open (desktop)', () => {
	test('/en?mode=manual has no violations', async ({ page }) => {
		await page.goto('/en?mode=manual');
		await expectRealPage(page, '/en');
		await expectNoA11yViolations(page);
	});
});
