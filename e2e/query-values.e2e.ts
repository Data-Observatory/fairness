import { expect, test } from '@playwright/test';
import { loadTaxonomy, loadTools } from './content';
import { checkbox, expectFilterResultsVisible, resultCount, wholeNumber } from './helpers';

// Review defect: unknown ids in the query (?mode=bogus) were kept and produced an empty result.

const tools = loadTools();
const taxonomy = loadTaxonomy();
const ontology = tools.filter((tool) => (tool.targets ?? []).includes('ontology')).map((t) => t.id);

test.describe('unknown query values are ignored', () => {
	test('/en?target=ontology&mode=bogus shows the same result as ?target=ontology', async ({
		page
	}) => {
		await page.goto('/en?target=ontology');
		await expectFilterResultsVisible(page, ontology);

		await page.goto('/en?target=ontology&mode=bogus');
		await expectFilterResultsVisible(page, ontology);
		await expect(checkbox(page, 'target', 'ontology')).toBeChecked();
		for (const option of taxonomy.mode as { id: string }[]) {
			await expect(checkbox(page, 'mode', option.id)).not.toBeChecked();
		}
	});

	test('/en?mode=bogus alone shows every resource and no empty message', async ({ page }) => {
		await page.goto('/en?mode=bogus');
		await expect(resultCount(page)).toContainText(wholeNumber(tools.length));
		await expect(page.locator('[data-testid=no-results]')).toBeHidden();
		await expect(page.locator('[data-testid=clear-filters]')).toBeHidden();
	});

	test('a known and an unknown id in one group keep only the known one', async ({ page }) => {
		await page.goto('/en?target=ontology,bogus');
		await expectFilterResultsVisible(page, ontology);
	});
});
