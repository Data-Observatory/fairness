import { expect } from '@playwright/test';
import { test } from './base';
import { LOCALES, loadSite } from './content';
import { comparableIds, compareUrl, picker, table, tid } from './compare-helpers';

// Without JavaScript the comparison cannot run: the page says so and links to the finder table
// on the home page and to the detail pages. The box is part of the prerendered HTML and is hidden
// under the `js` class (set by static/consent-loader.js), as on the guided finder.

const site = loadSite();
const ids = comparableIds();

test.skip(site.features.compare === false, 'features.compare is disabled in site.yaml');

test.describe('compare: JavaScript disabled', () => {
	test.use({ javaScriptEnabled: false });

	for (const locale of LOCALES) {
		test.describe(`/${locale}`, () => {
			test('explains the limitation, shows no picker and no table, and has no js class', async ({
				page
			}) => {
				await page.goto(compareUrl(locale, ids.slice(0, 2)));
				await expect(page.locator('html')).not.toHaveClass(/(^|\s)js(\s|$)/);
				await expect(page.locator('h1')).toHaveCount(1);
				await expect(page.locator('h1')).toBeVisible();
				await expect(tid(page, 'compare-noscript')).toBeVisible();
				await expect(tid(page, 'compare-noscript')).not.toBeEmpty();
				await expect(tid(page, 'caveats')).toBeVisible();
				await expect(table(page)).toHaveCount(0);
				await expect(picker(page)).toHaveCount(0);
				await expect(page.locator('main input')).toHaveCount(0);
			});

			test('links to the finder table on the home page', async ({ page }) => {
				await page.goto(compareUrl(locale));
				const link = tid(page, 'compare-noscript').locator('a[href$="#finder"]');
				await expect(link).toHaveCount(1);
				await expect(link).toBeVisible();
				await link.click();
				await expect(page).toHaveURL(new RegExp(`/${locale}/?#finder$`));
				await expect(page.locator('table[data-testid=finder-table]')).toBeVisible();
			});

			test('links to the detail page of every tool, and the links open', async ({ page }) => {
				await page.goto(compareUrl(locale));
				const links = tid(page, 'compare-noscript').locator('a[data-tool-id]');
				await expect(links).toHaveCount(ids.length);
				const found = await links.evaluateAll((nodes) =>
					nodes.map((node) => [node.getAttribute('data-tool-id'), node.getAttribute('href')])
				);
				expect(found.map(([id]) => id)).toEqual(ids);
				for (const [id, href] of found) expect(href).toBe(`/${locale}/tools/${id}`);
				await links.first().click();
				await expect(page).toHaveURL(new RegExp(`/${locale}/tools/${ids[0]}/?$`));
			});
		});
	}
});

for (const locale of LOCALES) {
	test.describe(`compare /${locale}: no-JavaScript box and the js class`, () => {
		test('the prerendered HTML carries the box and the head script that sets js', async ({
			request
		}) => {
			const response = await request.get(compareUrl(locale));
			expect(response.ok()).toBe(true);
			const html = await response.text();
			expect(html).toContain('data-testid="compare-noscript"');
			expect(html).not.toContain('data-testid="compare-table"');
			const head = html.slice(0, html.indexOf('</head>'));
			expect(head).toMatch(/<script\b[^>]*\bsrc="[^"]*consent-loader\.js"/);
		});

		test('with JavaScript the box is hidden and the picker is shown', async ({ page }) => {
			await page.goto(compareUrl(locale));
			await expect(page.locator('html')).toHaveClass(/(^|\s)js(\s|$)/);
			await expect(picker(page)).toBeVisible();
			await expect(tid(page, 'compare-noscript')).toBeHidden();
		});

		test('with JavaScript but before hydration the box is in the page and hidden', async ({
			page
		}) => {
			await page.route('**/_app/**/*.js', (route) => route.abort());
			await page.goto(compareUrl(locale), { waitUntil: 'domcontentloaded' });
			await expect(tid(page, 'compare-noscript')).toHaveCount(1);
			await expect(tid(page, 'compare-noscript')).toBeHidden();
		});
	});
}
