import { expect, test } from '@playwright/test';
import { loadTools } from './content';
import { checkbox, expectFilterResultsVisible } from './helpers';

// Review defect: matches could hide inside a closed <details> section while the result count
// said otherwise. None of these tests may call expandAllSections or click a section summary.

const tools = loadTools();
const idsWhere = (predicate: (tool: (typeof tools)[number]) => boolean) =>
	tools.filter(predicate).map((tool) => tool.id);

const CASES = [
	{
		query: 'target=ontology',
		group: 'target',
		value: 'ontology',
		ids: idsWhere((tool) => (tool.targets ?? []).includes('ontology'))
	},
	{
		query: 'mode=manual',
		group: 'mode',
		value: 'manual',
		ids: idsWhere((tool) => tool.mode === 'manual')
	}
];

for (const viewport of [
	{ name: 'desktop', size: { width: 1280, height: 720 } },
	{ name: 'mobile 375px', size: { width: 375, height: 812 } }
]) {
	test.describe(`filter results are never hidden in a closed section (${viewport.name})`, () => {
		test.use({ viewport: viewport.size });

		for (const item of CASES) {
			test(`opening /en?${item.query} shows every counted card`, async ({ page }) => {
				expect(item.ids.length).toBeGreaterThan(0);
				await page.goto(`/en?${item.query}`);
				await expectFilterResultsVisible(page, item.ids);
			});

			test(`checking ${item.group}=${item.value} shows every counted card`, async ({ page }) => {
				await page.goto('/en');
				const panel = page.locator('[data-testid=filter-bar] details');
				await expect(panel).toBeAttached();
				if (!(await panel.evaluate((node) => (node as HTMLDetailsElement).open))) {
					await panel.locator('> summary').click();
				}
				await checkbox(page, item.group, item.value).check();
				await expectFilterResultsVisible(page, item.ids);
			});
		}
	});
}

test('sections with matches are open and sections without matches say so (target=ontology)', async ({
	page
}) => {
	await page.goto('/en?target=ontology');
	await expectFilterResultsVisible(
		page,
		idsWhere((tool) => (tool.targets ?? []).includes('ontology'))
	);
	await expect(page.locator('[data-testid=no-results]')).toBeHidden();
});
