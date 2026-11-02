import { expect, test } from '@playwright/test';
import { expandAllSections, expectRealPage } from './helpers';

// Owner requirement: no Google request before consent. The Google tag is the only third-party
// request and it loads only after the visitor accepts (see consent.e2e.ts). Its hosts are still
// stubbed here so a regression cannot send hits to Google from a test run.
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

test.describe('no third-party request before a consent choice', () => {
	for (const url of PAGES) {
		test(`${url} only requests its own origin before a choice`, async ({ page, baseURL }) => {
			const origin = new URL(baseURL!).origin;
			const foreign: string[] = [];
			page.on('request', (request) => {
				const target = request.url();
				if (target.startsWith('data:') || target.startsWith('blob:')) return;
				if (new URL(target).origin !== origin) foreign.push(target);
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

test.describe('Google tag before consent', () => {
	for (const url of ['/en', '/es', '/en/about', '/en/tools/f-uji', '/en/wizard']) {
		test(`${url} sends no Google request before a choice`, async ({ page }) => {
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
			expect(googleRequests).toEqual([]);
			expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0);
		});
	}
});
