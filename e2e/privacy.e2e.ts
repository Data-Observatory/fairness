import { expect } from '@playwright/test';
import { test } from './base';
import { expandAllSections, expectRealPage } from './helpers';

// Owner decision 2026-11-03: analytics are on by default and the visitor can turn them off (see
// consent.e2e.ts). The Google tag is the only third-party request: it loads by default and not at
// all after a stored denied choice. Its hosts are stubbed here so a test run sends no hits to
// Google.
const GOOGLE_HOST =
	/^(www|region\d+)?\.?(googletagmanager|google-analytics|analytics\.google)\.com$/;

const PAGES = [
	'/',
	'/en',
	'/es',
	'/en/about',
	'/es/about',
	'/en/changelog',
	'/es/changelog',
	'/en/tools/f-uji',
	'/es/tools/f-uji',
	'/en/tools/fair-enough',
	'/es/tools/fair-eva',
	'/en/wizard',
	'/es/wizard',
	'/en/compare',
	'/es/compare',
	'/en/compare?tools=f-uji,fair-enough,fair-eva',
	'/es/compare?tools=f-uji,fair-enough',
	'/en/wizard?level=advanced&target=dataset&input=doi',
	'/es/wizard?target=dataset&input=doi&step=results'
];

test.describe('no third-party request other than the Google tag', () => {
	for (const url of PAGES) {
		test(`${url} only requests its own origin and the Google hosts`, async ({ page, baseURL }) => {
			const origin = new URL(baseURL!).origin;
			const foreign: string[] = [];
			page.on('request', (request) => {
				const target = request.url();
				if (target.startsWith('data:') || target.startsWith('blob:')) return;
				if (new URL(target).origin === origin) return;
				if (GOOGLE_HOST.test(new URL(target).hostname)) return;
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

test.describe('Google tag by default', () => {
	for (const url of ['/en', '/es', '/en/about', '/en/tools/f-uji', '/en/wizard']) {
		test(`${url} requests the Google tag once without a stored choice`, async ({ page }) => {
			const googleRequests: string[] = [];
			page.on('request', (request) => {
				if (GOOGLE_HOST.test(new URL(request.url()).hostname)) googleRequests.push(request.url());
			});
			await page.route(
				(target) => GOOGLE_HOST.test(target.hostname),
				(route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
			);
			await page.goto(url);
			await page.waitForLoadState('networkidle');
			expect(
				googleRequests.filter((item) => item.startsWith('https://www.googletagmanager.com/gtag/js'))
			).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-X6BJF4NQ71']);
			expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(1);
		});
	}
});
