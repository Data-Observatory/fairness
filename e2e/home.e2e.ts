import { expect, test } from '@playwright/test';
import { LOCALES, loadSections, loadSite, loadTools } from './content';
import { cardFor, cards, expandAllSections, expectExternalLink, section } from './helpers';

const tools = loadTools();
const sections = loadSections();
const site = loadSite();

for (const locale of LOCALES) {
	test.describe(`home /${locale}`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(`/${locale}`);
		});

		test('renders the h1, the caveats box and the html lang', async ({ page }) => {
			await expect(page.locator('html')).toHaveAttribute('lang', locale);
			await expect(page.locator('h1')).toHaveCount(1);
			await expect(page.locator('h1')).not.toBeEmpty();
			await expect(page.locator('[data-testid=caveats]')).toBeVisible();
			await expect(page.locator('[data-testid=caveats]')).not.toBeEmpty();
		});

		test('renders the sections in the order of sections.yaml', async ({ page }) => {
			const ids = await page
				.locator('section[data-section-id]')
				.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section-id')));
			expect(ids).toEqual(sections.map((item) => item.id));
			expect(ids).toHaveLength(4);
		});

		test('collapsed sections are details elements that toggle open and closed', async ({
			page
		}) => {
			for (const item of sections) {
				const details = section(page, item.id).locator('details');
				if (!item.collapsed) {
					await expect(details).toHaveCount(0);
					continue;
				}
				await expect(details).toHaveCount(1);
				await expect(details).not.toHaveAttribute('open', /.*/);
				const firstCard = section(page, item.id).locator('[data-testid=tool-card]').first();
				await expect(firstCard).toBeHidden();

				await details.locator('> summary').click();
				await expect(details).toHaveAttribute('open', /.*/);
				await expect(firstCard).toBeVisible();

				await details.locator('> summary').click();
				await expect(details).not.toHaveAttribute('open', /.*/);
				await expect(firstCard).toBeHidden();
			}
		});

		test('the card count equals the number of tools in content', async ({ page }) => {
			await expect(cards(page)).toHaveCount(tools.length);
			for (const tool of tools) {
				await expect(section(page, tool.section).locator(`[data-tool-id=${tool.id}]`)).toHaveCount(
					1
				);
			}
		});

		test('every card has an external open link, a details link and a best-for line only when defined', async ({
			page
		}) => {
			await expandAllSections(page);
			for (const tool of tools) {
				const card = cardFor(page, tool.id);
				await expect(card).toBeVisible();
				await expectExternalLink(card.locator('[data-testid=open-tool]'), tool.url);
				await expect(card.locator('[data-testid=tool-details]')).toHaveAttribute(
					'href',
					new RegExp(`/${locale}/tools/${tool.id}/?$`)
				);
				const expected = site.features.bestFor && tool.best_for ? 1 : 0;
				await expect(card.locator('[data-testid=best-for]')).toHaveCount(expected);
				if (expected) {
					await expect(card.locator('[data-testid=best-for]')).toContainText(
						tool.best_for![locale]
					);
				}
			}
		});

		test('the finder section links to the guided finder only when the feature is on', async ({
			page
		}) => {
			test.skip(!site.features.finderTable, 'finderTable is disabled in site.yaml');
			const finder = page.locator('section#finder[data-testid=finder]');
			await expect(finder).toHaveCount(1);
			const link = finder.locator('[data-testid=wizard-link]');
			if (!site.features.wizard) {
				await expect(link).toHaveCount(0);
				return;
			}
			await expect(link).toHaveCount(1);
			await expect(link).toBeVisible();
			await expect(link).toHaveAttribute('href', new RegExp(`/${locale}/wizard/?$`));
			await link.click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/wizard/?$`));
			await expect(page.locator('h1')).toHaveCount(1);
		});

		test('renders the finder table with one row per finder entry', async ({ page }) => {
			test.skip(!site.features.finderTable, 'finderTable is disabled in site.yaml');
			await expect(page.locator('table[data-testid=finder-table]')).toBeVisible();
			await expect(page.locator('table[data-testid=finder-table] tbody tr')).not.toHaveCount(0);
		});
	});
}
