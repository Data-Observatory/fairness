import { expect, test, type Page } from '@playwright/test';
import { LOCALES, loadSite, loadTaxonomy, loadTools } from './content';
import { cards, expandAllSections, visibleCards, wholeNumber } from './helpers';

const tools = loadTools();
const site = loadSite();
const taxonomy = loadTaxonomy();

const matching = (mode: string, target: string) =>
	tools.filter((tool) => tool.mode === mode && (tool.targets ?? []).includes(target));

const checkbox = (page: Page, group: string, value: string) =>
	page.locator(`fieldset[data-filter-group=${group}] input[type=checkbox][value=${value}]`);

const visibleIds = (page: Page) =>
	visibleCards(page).evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-tool-id')));

const resultCount = (page: Page) =>
	page.getByRole('status').and(page.locator('[data-testid=result-count]'));

async function expectVisibleIds(page: Page, expected: string[]) {
	await expect(visibleCards(page)).toHaveCount(expected.length);
	expect((await visibleIds(page)).sort()).toEqual([...expected].sort());
	await expect(resultCount(page)).toContainText(wholeNumber(expected.length));
}

const expected = matching('automated', 'dataset').map((tool) => tool.id);

for (const locale of LOCALES) {
	test.describe(`filters /${locale}`, () => {
		test('has a fieldset with a legend and real checkboxes for each filter group', async ({
			page
		}) => {
			await page.goto(`/${locale}`);
			const groups = taxonomy.filters.filter((g) => site.features.statusFilter || g !== 'status');
			await expect(page.locator('fieldset[data-filter-group]')).toHaveCount(groups.length);
			for (const group of groups) {
				const fieldset = page.locator(`fieldset[data-filter-group=${group}]`);
				await expect(fieldset.locator('legend')).toHaveCount(1);
				await expect(fieldset.locator('legend')).not.toBeEmpty();
				const options = taxonomy[group] as { id: string }[];
				await expect(fieldset.locator('input[type=checkbox]')).toHaveCount(options.length);
				for (const option of options) {
					await expect(checkbox(page, group, option.id)).toHaveCount(1);
				}
			}
		});

		test('mode=automated and target=dataset show only matching cards and update the count', async ({
			page
		}) => {
			expect(expected.length).toBeGreaterThan(0);
			expect(expected.length).toBeLessThan(tools.length);
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await expect(visibleCards(page)).toHaveCount(tools.length);
			await expect(resultCount(page)).toContainText(wholeNumber(tools.length));

			await checkbox(page, 'mode', 'automated').check();
			await checkbox(page, 'target', 'dataset').check();
			await expectVisibleIds(page, expected);
		});

		test('mirrors the selection in the URL query and restores it on reload', async ({ page }) => {
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await checkbox(page, 'mode', 'automated').check();
			await checkbox(page, 'target', 'dataset').check();
			await expectVisibleIds(page, expected);

			await expect
				.poll(() => {
					const params = new URL(page.url()).searchParams;
					return [params.get('mode'), params.get('target')];
				})
				.toEqual(['automated', 'dataset']);

			await page.reload();
			await expandAllSections(page);
			await expect(checkbox(page, 'mode', 'automated')).toBeChecked();
			await expect(checkbox(page, 'target', 'dataset')).toBeChecked();
			await expect(checkbox(page, 'mode', 'manual')).not.toBeChecked();
			await expectVisibleIds(page, expected);
		});

		test('opening a shared URL with a query applies the filter', async ({ page }) => {
			await page.goto(`/${locale}?mode=automated&target=dataset`);
			await expandAllSections(page);
			await expect(checkbox(page, 'mode', 'automated')).toBeChecked();
			await expectVisibleIds(page, expected);
		});

		test('clear filters restores every card and the plain URL', async ({ page }) => {
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await checkbox(page, 'mode', 'automated').check();
			await checkbox(page, 'target', 'dataset').check();
			await expectVisibleIds(page, expected);

			await page.locator('[data-testid=clear-filters]').click();
			await expect(visibleCards(page)).toHaveCount(tools.length);
			await expect(resultCount(page)).toContainText(wholeNumber(tools.length));
			await expect(checkbox(page, 'mode', 'automated')).not.toBeChecked();
			await expect(checkbox(page, 'target', 'dataset')).not.toBeChecked();
			await expect
				.poll(() => {
					const params = new URL(page.url()).searchParams;
					return [params.get('mode'), params.get('target')];
				})
				.toEqual([null, null]);
		});

		test('a combination with no matches shows the no-results message and a clear control', async ({
			page
		}) => {
			expect(matching('manual', 'ontology')).toHaveLength(0);
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await expect(page.locator('[data-testid=no-results]')).toBeHidden();

			await checkbox(page, 'mode', 'manual').check();
			await checkbox(page, 'target', 'ontology').check();
			await expect(page.locator('[data-testid=no-results]')).toBeVisible();
			await expect(visibleCards(page)).toHaveCount(0);
			await expect(resultCount(page)).toContainText(wholeNumber(0));
			await expect(page.locator('[data-testid=clear-filters]')).toBeVisible();

			await page.locator('[data-testid=clear-filters]').click();
			await expect(page.locator('[data-testid=no-results]')).toBeHidden();
			await expect(visibleCards(page)).toHaveCount(tools.length);
		});

		test('selecting two options of one group combines them with OR', async ({ page }) => {
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await checkbox(page, 'mode', 'manual').check();
			await checkbox(page, 'mode', 'hybrid').check();
			const ids = tools
				.filter((tool) => tool.mode === 'manual' || tool.mode === 'hybrid')
				.map((tool) => tool.id);
			await expectVisibleIds(page, ids);
			await expect(cards(page)).toHaveCount(tools.length);
		});
	});
}
