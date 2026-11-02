import { expect, test } from '@playwright/test';
import { LOCALES, loadSite, loadTools, type Tool } from './content';
import { expectExternalLink, expectNoA11yViolations, expectRealPage } from './helpers';

// Detail pages: the report link (a plain link to a prefilled GitHub issue form) and the
// cross-links between a framework entry and the tools that implement it.

const site = loadSite();
const tools = loadTools();
const GENERIC = ['custom', 'other'];

const specific = (tool: Tool) => (tool.frameworks ?? []).filter((id) => !GENERIC.includes(id));
const sharing = (tool: Tool, kind: Tool['kind']) =>
	tools
		.filter((other) => other.kind === kind)
		.filter((other) => specific(other).some((id) => specific(tool).includes(id)))
		.map((other) => other.id)
		.sort();

const withBoth = tools.find(
	(tool) => tool.kind === 'tool' && sharing(tool, 'framework').length > 0
)!;
const framework = tools.find(
	(tool) => tool.kind === 'framework' && sharing(tool, 'tool').length > 0
)!;
const withNone = tools.find(
	(tool) => tool.kind === 'tool' && sharing(tool, 'framework').length === 0
)!;
const frameworkWithNone = tools.find(
	(tool) => tool.kind === 'framework' && sharing(tool, 'tool').length === 0
);

for (const locale of LOCALES) {
	test.describe(`detail links /${locale}`, () => {
		test('every detail page has an external report link to the prefilled issue form', async ({
			page
		}) => {
			for (const tool of tools) {
				await page.goto(`/${locale}/tools/${tool.id}`);
				const link = page.locator('[data-testid=report-tool]');
				await expect(link).toHaveCount(1);
				const href = (await link.getAttribute('href')) ?? '';
				expect(href.startsWith(`${site.repository}/issues/new?template=report-tool.yml`)).toBe(
					true
				);
				expect(href).toContain(`tool=${encodeURIComponent(tool.id)}`);
				expect(href).toContain(`url=${encodeURIComponent(tool.url)}`);
				await expectExternalLink(link, href);
			}
		});

		test('the report link is visible text with the external-link text, not a form', async ({
			page
		}) => {
			await page.goto(`/${locale}/tools/f-uji`);
			const link = page.locator('[data-testid=report-tool]');
			await expect(link).toBeVisible();
			await expect(link).toContainText(locale === 'en' ? 'Report' : 'Informar');
			await expect(link.locator('.sr-only')).toHaveCount(1);
			await expect(page.locator('main form, form[action*="github"]')).toHaveCount(0);
		});

		test(`${withBoth.id} lists the framework entries it implements, linked to their pages`, async ({
			page,
			request
		}) => {
			await page.goto(`/${locale}/tools/${withBoth.id}`);
			const list = page.locator('[data-testid=implements]');
			await expect(list).toBeVisible();
			const expected = sharing(withBoth, 'framework');
			expect(expected).toEqual(
				expect.arrayContaining(['fair-impact-metrics', 'fairsfair-data-object-metrics'])
			);
			const hrefs = await list
				.locator('a')
				.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
			expect(hrefs.sort()).toEqual(expected.map((id) => `/${locale}/tools/${id}`).sort());
			for (const href of hrefs) {
				expect((await request.get(href!)).status()).toBe(200);
			}
			await expect(page.locator('[data-testid=implemented-by]')).toHaveCount(0);
		});

		test(`${framework.id} lists the tools that implement it, linked to their pages`, async ({
			page,
			request
		}) => {
			await page.goto(`/${locale}/tools/${framework.id}`);
			const list = page.locator('[data-testid=implemented-by]');
			await expect(list).toBeVisible();
			await expect(
				page.locator('h2', { hasText: /^(Implemented by|Implementado por)$/ })
			).toHaveCount(1);
			const hrefs = await list
				.locator('a')
				.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
			expect(hrefs.sort()).toEqual(
				sharing(framework, 'tool')
					.map((id) => `/${locale}/tools/${id}`)
					.sort()
			);
			for (const href of hrefs) {
				expect((await request.get(href!)).status()).toBe(200);
			}
			await expect(page.locator('[data-testid=implements]')).toHaveCount(0);
		});

		test('the RDA FDMM entry is implemented by FAIR EVA', async ({ page }) => {
			await page.goto(`/${locale}/tools/rda-fair-data-maturity-model`);
			await expect(
				page.locator('[data-testid=implemented-by] a[href$="/tools/fair-eva"]')
			).toHaveCount(1);
		});

		test(`${withNone.id} has no cross-link list`, async ({ page }) => {
			await page.goto(`/${locale}/tools/${withNone.id}`);
			await expect(page.locator('[data-testid=implements]')).toHaveCount(0);
			await expect(page.locator('[data-testid=implemented-by]')).toHaveCount(0);
		});

		test('an entry with the framework id custom has no cross-link list', async ({ page }) => {
			await page.goto(`/${locale}/tools/fair-checker`);
			await expect(page.locator('[data-testid=implements]')).toHaveCount(0);
			await expect(page.locator('[data-testid=implemented-by]')).toHaveCount(0);
		});

		if (frameworkWithNone) {
			test(`${frameworkWithNone.id} has no "Implemented by" list`, async ({ page }) => {
				await page.goto(`/${locale}/tools/${frameworkWithNone.id}`);
				await expect(page.locator('[data-testid=implemented-by]')).toHaveCount(0);
			});
		}

		for (const id of [withBoth.id, framework.id]) {
			test(`/${locale}/tools/${id} has no accessibility violations with the cross-link list`, async ({
				page
			}) => {
				const url = `/${locale}/tools/${id}`;
				await page.goto(url);
				await expectRealPage(page, url);
				await expect(
					page.locator('[data-testid=implements], [data-testid=implemented-by]')
				).toBeVisible();
				await expectNoA11yViolations(page);
			});
		}
	});
}
