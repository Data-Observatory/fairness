import { expect, test } from '@playwright/test';
import { expandAllSections, expectRealPage } from './helpers';

// Owner decision 2026-11-02: the Google tag is the only third-party request. Its hosts are
// stubbed here so test runs send no hits to Google.
const GOOGLE_HOST =
	/^(www|region\d+)?\.?(googletagmanager|google-analytics|analytics\.google)\.com$/;
const GOOGLE_TAG_ID = 'G-X6BJF4NQ71';

const PAGES = [
	'/',
	'/en',
	'/es',
	'/en/about',
	'/es/about',
	'/en/tools/f-uji',
	'/es/tools/f-uji',
	'/en/tools/fair-enough',
	'/es/tools/fair-eva',
	'/en/wizard',
	'/es/wizard',
	'/en/wizard?level=advanced&target=dataset&input=doi',
	'/es/wizard?target=dataset&input=doi&step=results'
];

test.describe('only the Google tag requests a third party', () => {
	for (const url of PAGES) {
		test(`${url} only requests its own origin`, async ({ page, baseURL }) => {
			const origin = new URL(baseURL!).origin;
			const foreign: string[] = [];
			page.on('request', (request) => {
				const target = request.url();
				if (target.startsWith('data:') || target.startsWith('blob:')) return;
				if (new URL(target).origin !== origin && !GOOGLE_HOST.test(new URL(target).hostname))
					foreign.push(target);
			});
			await page.route(
				(target) => GOOGLE_HOST.test(target.hostname),
				(route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
			);

			await page.goto(url);
			if (url !== '/') await expectRealPage(page, url);
			await page.waitForLoadState('networkidle');
			if (url === '/en' || url === '/es') {
				await expandAllSections(page);
				await page
					.locator('fieldset[data-filter-group=mode] input[type=checkbox][value=automated]')
					.check();
				await page.waitForLoadState('networkidle');
			}
			expect(foreign).toEqual([]);
		});
	}
});

test.describe('Google tag', () => {
	for (const url of ['/en', '/es', '/en/about', '/en/tools/f-uji', '/en/wizard']) {
		test(`${url} loads gtag.js once for the configured id`, async ({ page }) => {
			const tagRequests: string[] = [];
			page.on('request', (request) => {
				if (request.url().startsWith('https://www.googletagmanager.com/gtag/js'))
					tagRequests.push(request.url());
			});
			await page.route(
				(target) => GOOGLE_HOST.test(target.hostname),
				(route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
			);
			await page.goto(url);
			await page.waitForLoadState('networkidle');
			expect(tagRequests).toEqual([`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`]);
			expect(await page.evaluate(() => typeof (window as { gtag?: unknown }).gtag)).toBe(
				'function'
			);
		});
	}
});
