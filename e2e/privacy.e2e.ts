import { expect, test } from '@playwright/test';
import { expandAllSections, expectRealPage } from './helpers';

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

test.describe('no third-party requests', () => {
	for (const url of PAGES) {
		test(`${url} only requests its own origin`, async ({ page, baseURL }) => {
			const origin = new URL(baseURL!).origin;
			const foreign: string[] = [];
			page.on('request', (request) => {
				const target = request.url();
				if (target.startsWith('data:') || target.startsWith('blob:')) return;
				if (new URL(target).origin !== origin) foreign.push(target);
			});

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
