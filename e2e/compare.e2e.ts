import { expect } from '@playwright/test';
import { test } from './base';
import { LOCALES, loadSite, loadTools } from './content';
import { expectNoA11yViolations, expectRealPage } from './helpers';
import {
	allBoxes,
	columnHeaders,
	columnIds,
	comparable,
	comparableIds,
	compareUrl,
	openCompare,
	pairWithMissingLicense,
	picker,
	sectionsWithTools,
	status,
	table,
	tid,
	toolBox,
	urlTools
} from './compare-helpers';

const site = loadSite();
const ids = comparableIds();
const [a, b, c, d] = ids;

// Owner decision D16: the comparison covers tools (kind tool) only. State lives in the query
// string `?tools=a,b,c`, read on the client after mount and written with replaceState.

test.skip(site.features.compare === false, 'features.compare is disabled in site.yaml');

test('the real content has at least four tools to compare', () => {
	expect(ids.length).toBeGreaterThanOrEqual(4);
});

for (const locale of LOCALES) {
	test.describe(`compare /${locale}: picker`, () => {
		test('is a real page with one h1, the caveat box and the right language', async ({ page }) => {
			await openCompare(page, locale);
			await expectRealPage(page, compareUrl(locale));
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			await expect(tid(page, 'compare-noscript')).toBeHidden();
			await expect(tid(page, 'caveats')).toBeVisible();
		});

		test('offers one fieldset with a legend per section that holds tools, and only tools', async ({
			page
		}) => {
			await openCompare(page, locale);
			const sections = sectionsWithTools();
			const fieldsets = picker(page).locator('fieldset');
			await expect(fieldsets).toHaveCount(sections.length);
			for (const item of sections) {
				const box = picker(page).locator(`fieldset[data-section-id=${item.id}]`);
				await expect(box.locator('legend')).toBeVisible();
				await expect(box.locator('legend')).not.toBeEmpty();
				await expect(box.locator('input[type=checkbox]')).toHaveCount(item.tools.length);
				for (const tool of item.tools) {
					await expect(box.locator(`input[value=${tool.id}]`)).toBeVisible();
					await expect(box.locator('label').filter({ hasText: tool.name }).first()).toBeVisible();
				}
			}
			await expect(allBoxes(page)).toHaveCount(ids.length);
			const others = loadTools().filter((tool) => tool.kind !== 'tool');
			expect(others.length).toBeGreaterThan(0);
			for (const tool of others) await expect(toolBox(page, tool.id)).toHaveCount(0);
		});

		test('shows no table and asks for a selection before two tools are chosen', async ({
			page
		}) => {
			await openCompare(page, locale);
			await expect(table(page)).toHaveCount(0);
			await expect(status(page)).toContainText('0');
			await toolBox(page, a).check();
			await expect(table(page)).toHaveCount(0);
			await expect(status(page)).toContainText('1');
		});

		test('two tools give a table with a caption, a column header per tool and a row header per fact', async ({
			page
		}) => {
			await openCompare(page, locale);
			await toolBox(page, a).check();
			await toolBox(page, b).check();
			await expect(table(page)).toBeVisible();
			await expect(table(page).locator('caption')).not.toBeEmpty();
			await expect(columnHeaders(page)).toHaveCount(2);
			expect(await columnIds(page)).toEqual([a, b]);
			const names = new Map(comparable().map((tool) => [tool.id, tool.name]));
			for (const id of [a, b]) {
				const header = table(page).locator(`thead th[scope=col][data-tool-id=${id}]`);
				const link = header.locator('a');
				await expect(link).toHaveText(names.get(id)!);
				await expect(link).toHaveAttribute('href', new RegExp(`^/${locale}/tools/${id}/?$`));
				await expect(header.locator('[data-status]')).toHaveCount(1);
				await expect(header.locator('[data-status]')).not.toBeEmpty();
			}
			const rows = table(page).locator('tbody tr');
			expect(await rows.count()).toBeGreaterThan(3);
			await expect(table(page).locator('tbody th[scope=row]')).toHaveCount(await rows.count());
			for (const row of await rows.all()) {
				await expect(row.locator('td')).toHaveCount(2);
			}
		});

		test('three tools give three columns in the order of selection', async ({ page }) => {
			await openCompare(page, locale);
			for (const id of [c, a, b]) await toolBox(page, id).check();
			await expect(columnHeaders(page)).toHaveCount(3);
			expect(await columnIds(page)).toEqual([c, a, b]);
			expect(urlTools(page)).toEqual([c, a, b]);
		});

		test('with three selected every other option is disabled, and the live region says why', async ({
			page
		}) => {
			await openCompare(page, locale);
			await toolBox(page, a).check();
			await toolBox(page, b).check();
			const before = (await status(page).textContent()) ?? '';
			await expect(toolBox(page, c)).toBeEnabled();
			await toolBox(page, c).check();
			await expect(toolBox(page, d)).toBeDisabled();
			await expect(page.locator('input[name=tools]:disabled')).toHaveCount(ids.length - 3);
			for (const id of [a, b, c]) {
				await expect(toolBox(page, id)).toBeEnabled();
				await expect(toolBox(page, id)).toBeChecked();
			}
			await expect(status(page)).toContainText('3');
			const after = (await status(page).textContent()) ?? '';
			expect(after.trim().length).toBeGreaterThan(before.trim().length);

			await toolBox(page, b).uncheck();
			await expect(toolBox(page, d)).toBeEnabled();
			await expect(page.locator('input[name=tools]:disabled')).toHaveCount(0);
			await expect(columnHeaders(page)).toHaveCount(2);
		});

		test('a missing fact renders a message, not an empty cell', async ({ page }) => {
			const [withLicense, without] = pairWithMissingLicense();
			await openCompare(page, locale, [withLicense.id, without.id]);
			await expect(table(page)).toBeVisible();
			const missing = table(page).locator('td[data-missing]');
			expect(await missing.count()).toBeGreaterThan(0);
			for (const cell of await missing.all()) {
				await expect(cell).toHaveText(locale === 'en' ? 'Not recorded' : 'No registrado');
			}
			const row = table(page).locator('tbody tr[data-fact=license]');
			await expect(row.locator(`td[data-tool-id=${without.id}]`)).toHaveAttribute(
				'data-missing',
				/.*/
			);
			await expect(row.locator(`td[data-tool-id=${withLicense.id}]`)).toContainText(
				withLicense.license!
			);
			for (const cell of await table(page).locator('tbody td').all()) {
				await expect(cell).not.toHaveText('');
			}
		});

		test('the table sits in a focusable, labelled, scrollable region', async ({ page }) => {
			await openCompare(page, locale, [a, b, c]);
			const region = tid(page, 'compare-scroll');
			await expect(region).toHaveAttribute('tabindex', '0');
			await expect(region).toHaveAttribute('role', 'region');
			await expect(region).toHaveAttribute('aria-label', /\S/);
			await expect(region.locator('table')).toHaveCount(1);
			await expect(region).toHaveCSS('overflow-x', 'auto');
		});
	});

	test.describe(`compare /${locale}: query string`, () => {
		test('a selection is written to the address without adding history entries', async ({
			page
		}) => {
			await openCompare(page, locale);
			const length = await page.evaluate(() => history.length);
			await toolBox(page, b).check();
			await toolBox(page, a).check();
			expect(urlTools(page)).toEqual([b, a]);
			expect(new URL(page.url()).search).toBe(`?tools=${b},${a}`);
			await toolBox(page, b).uncheck();
			expect(urlTools(page)).toEqual([a]);
			await toolBox(page, a).uncheck();
			expect(new URL(page.url()).search).toBe('');
			expect(await page.evaluate(() => history.length)).toBe(length);
		});

		test('reloading restores the selection, the table and the order', async ({ page }) => {
			await openCompare(page, locale);
			for (const id of [c, a]) await toolBox(page, id).check();
			await page.reload();
			await expect(picker(page)).toBeVisible();
			await expect(toolBox(page, c)).toBeChecked();
			await expect(toolBox(page, a)).toBeChecked();
			await expect(toolBox(page, b)).not.toBeChecked();
			expect(await columnIds(page)).toEqual([c, a]);
		});

		test('opens a shared address with its selection', async ({ page }) => {
			await openCompare(page, locale, [b, a, d]);
			expect(await columnIds(page)).toEqual([b, a, d]);
			for (const id of [a, b, d]) await expect(toolBox(page, id)).toBeChecked();
			await expect(toolBox(page, c)).toBeDisabled();
		});

		test('ignores unknown ids and ids of other kinds', async ({ page }) => {
			const framework = loadTools().find((tool) => tool.kind === 'framework')!;
			await openCompare(page, locale, ['nope', framework.id, a, 'also-nope', b]);
			expect(await columnIds(page)).toEqual([a, b]);
			await expect(page.locator('input[name=tools]:checked')).toHaveCount(2);
		});

		test('keeps the first three ids when the address lists more', async ({ page }) => {
			await openCompare(page, locale, [a, b, c, d]);
			expect(await columnIds(page)).toEqual([a, b, c]);
			await expect(toolBox(page, d)).toBeDisabled();
		});

		test('one preselected tool shows no table and one more choice gives it', async ({ page }) => {
			await openCompare(page, locale, a);
			await expect(toolBox(page, a)).toBeChecked();
			await expect(table(page)).toHaveCount(0);
			await toolBox(page, b).check();
			await expect(columnHeaders(page)).toHaveCount(2);
		});
	});
}

test.describe('compare: locale switch keeps the query', () => {
	test('the switch hrefs carry the tools parameter, also after a change', async ({ page }) => {
		await openCompare(page, 'en', [a, b]);
		await expect(tid(page, 'locale-switch-es')).toHaveAttribute(
			'href',
			new RegExp(`^/es/compare/?\\?tools=${a},${b}$`)
		);
		await toolBox(page, c).check();
		await expect(tid(page, 'locale-switch-es')).toHaveAttribute(
			'href',
			new RegExp(`^/es/compare/?\\?tools=${a},${b},${c}$`)
		);
		await expect(tid(page, 'locale-switch-en')).toHaveAttribute(
			'href',
			new RegExp(`^/en/compare/?\\?tools=${a},${b},${c}$`)
		);
	});

	test('clicking the es switch restores the selection in Spanish', async ({ page }) => {
		await openCompare(page, 'en', [b, a]);
		await tid(page, 'locale-switch-es').click();
		await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/es/compare');
		await expect(page.locator('html')).toHaveAttribute('lang', 'es');
		await expect(picker(page)).toBeVisible();
		expect(urlTools(page)).toEqual([b, a]);
		expect(await columnIds(page)).toEqual([b, a]);
	});
});

test.describe('compare: accessibility and layout', () => {
	for (const locale of LOCALES) {
		for (const selection of [[], [a], [a, b], [a, b, c]]) {
			test(`/${locale}/compare with ${selection.length} selected has no axe violations`, async ({
				page
			}) => {
				await openCompare(page, locale, selection);
				await expectRealPage(page, compareUrl(locale, selection));
				if (selection.length >= 2) await expect(table(page)).toBeVisible();
				await expectNoA11yViolations(page);
			});
		}
	}

	test.describe('at 375x812', () => {
		test.use({ viewport: { width: 375, height: 812 } });

		for (const locale of LOCALES) {
			test(`/${locale}/compare with three tools has no horizontal page scroll`, async ({
				page
			}) => {
				await openCompare(page, locale, [a, b, c]);
				await expect(table(page)).toBeVisible();
				const { scrollWidth, innerWidth } = await page.evaluate(() => ({
					scrollWidth: document.documentElement.scrollWidth,
					innerWidth: window.innerWidth
				}));
				expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
				const region = await tid(page, 'compare-scroll').evaluate((node) => ({
					scrollWidth: node.scrollWidth,
					clientWidth: node.clientWidth
				}));
				expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
			});

			test(`/${locale}/compare has no axe violations with three tools`, async ({ page }) => {
				await openCompare(page, locale, [a, b, c]);
				await expect(table(page)).toBeVisible();
				await expectNoA11yViolations(page);
			});
		}
	});
});

test.describe('compare: no request to another origin except the Google tag', () => {
	for (const locale of LOCALES) {
		test(`/${locale}/compare with a selection only requests its own origin and the Google tag`, async ({
			page,
			baseURL
		}) => {
			const origin = new URL(baseURL!).origin;
			const foreign: string[] = [];
			page.on('request', (request) => {
				const target = request.url();
				if (target.startsWith('data:') || target.startsWith('blob:')) return;
				if (new URL(target).origin === origin) return;
				// The Google tag is on by default (owner decision 2026-11-03); the base fixture stubs it.
				if (
					/(googletagmanager|google-analytics|analytics\.google)\.com$/.test(
						new URL(target).hostname
					)
				)
					return;
				foreign.push(target);
			});
			await openCompare(page, locale);
			for (const id of [a, b, c]) await toolBox(page, id).check();
			await page.waitForLoadState('networkidle');
			expect(foreign).toEqual([]);
		});
	}
});

test.describe('compare: entry points', () => {
	for (const locale of LOCALES) {
		test(`the /${locale} home page links to the comparison, once, near the finder`, async ({
			page,
			request
		}) => {
			await page.goto(`/${locale}`);
			const link = page.locator('[data-testid=compare-link]');
			await expect(link).toHaveCount(1);
			await expect(link).toBeVisible();
			await expect(link).toHaveAttribute('href', new RegExp(`^/${locale}/compare/?$`));
			expect((await request.get(`/${locale}/compare`)).status()).toBe(200);
			await link.click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/compare/?$`));
			await expect(picker(page)).toBeVisible();
			await expect(page.locator('h1')).toHaveCount(1);
		});

		test(`a /${locale} tool page links to the comparison with that tool preselected`, async ({
			page
		}) => {
			await page.goto(`/${locale}/tools/${b}`);
			const link = page.locator('[data-testid=compare-link]');
			await expect(link).toHaveCount(1);
			await expect(link).toBeVisible();
			await expect(link).toHaveAttribute('href', new RegExp(`^/${locale}/compare/?\\?tools=${b}$`));
			await link.click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/compare/?\\?tools=${b}$`));
			await expect(picker(page)).toBeVisible();
			await expect(toolBox(page, b)).toBeChecked();
			await expect(page.locator('input[name=tools]:checked')).toHaveCount(1);
		});

		test(`the /${locale} page of a framework, directory or guide has no comparison link`, async ({
			page
		}) => {
			for (const kind of ['framework', 'directory', 'guide']) {
				const entry = loadTools().find((tool) => tool.kind === kind)!;
				await page.goto(`/${locale}/tools/${entry.id}`);
				await expect(page.locator('h1')).toBeVisible();
				await expect(page.locator('[data-testid=compare-link]')).toHaveCount(0);
			}
		});

		test(`every /${locale} tool page link resolves`, async ({ request }) => {
			for (const id of ids) {
				const response = await request.get(`/${locale}/tools/${id}`);
				expect(await response.text()).toContain(`/${locale}/compare?tools=${id}`);
			}
		});
	}

	test('the navigation has no comparison item', async ({ page }) => {
		await page.goto('/en');
		await expect(page.locator('header nav a[href*="/compare"]')).toHaveCount(0);
	});
});
