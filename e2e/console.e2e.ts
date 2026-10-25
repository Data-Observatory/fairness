import { expect, test } from '@playwright/test';
import { expectRealPage } from './helpers';

// Review defect: /favicon.ico answered 404 and logged a console error on every page.

const PAGES = [
	'/',
	'/en',
	'/es',
	'/en/about',
	'/es/about',
	'/en/tools/f-uji',
	'/es/tools/fair-enough'
];

test.describe('no console errors and no failed requests', () => {
	for (const url of PAGES) {
		test(`${url} loads cleanly`, async ({ page }) => {
			const problems: string[] = [];
			page.on('console', (message) => {
				if (message.type() === 'error') problems.push(`console: ${message.text()}`);
			});
			page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
			page.on('requestfailed', (request) =>
				problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`)
			);
			page.on('response', (response) => {
				if (response.status() >= 400)
					problems.push(`status ${response.status()}: ${response.url()}`);
			});

			await page.goto(url);
			if (url === '/') {
				await page.waitForURL((target) => /^\/(en|es)\/?$/.test(target.pathname));
				await expectRealPage(page, new URL(page.url()).pathname);
			} else {
				await expectRealPage(page, url);
			}
			await page.waitForLoadState('networkidle');
			expect(problems).toEqual([]);
		});
	}

	test('every page declares an icon that exists', async ({ page, request }) => {
		await page.goto('/en');
		const icon = page.locator('head link[rel~="icon"]').first();
		await expect(icon, 'head needs a <link rel="icon">').toHaveAttribute('href', /.+/);
		const href = await icon.getAttribute('href');
		const response = await request.get(new URL(href!, page.url()).href);
		expect(response.status()).toBe(200);
	});
});
