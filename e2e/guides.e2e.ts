import { expect, test } from '@playwright/test';
import { LOCALES, loadSections, loadTools } from './content';
import { cardFor, expectFilterResultsVisible, section } from './helpers';

// Guides are learning material: kind guide, section guides, no targets, mode, inputs or output.

const tools = loadTools();
const guides = tools.filter((tool) => tool.kind === 'guide');
const guidesSection = loadSections().find((item) => item.id === 'guides');

for (const locale of LOCALES) {
	test.describe(`guides section /${locale}`, () => {
		test('the guides section exists, is collapsed by default and holds the guide cards', async ({
			page
		}) => {
			expect(guidesSection).toBeDefined();
			expect(guidesSection?.collapsed).toBe(true);
			expect(guides.length).toBeGreaterThan(0);
			expect(guides.every((tool) => tool.section === 'guides')).toBe(true);

			await page.goto(`/${locale}`);
			const block = section(page, 'guides');
			await expect(block).toHaveCount(1);
			const details = block.locator('details');
			await expect(details).toHaveCount(1);
			await expect(details).not.toHaveAttribute('open', /.*/);
			await expect(block.locator('[data-testid=tool-card]')).toHaveCount(guides.length);
			for (const guide of guides) {
				await expect(cardFor(page, guide.id)).toHaveCount(1);
				await expect(cardFor(page, guide.id)).toBeHidden();
			}
			await details.locator('> summary').click();
			for (const guide of guides) await expect(cardFor(page, guide.id)).toBeVisible();
		});

		test('guide cards are hidden when a target filter is active', async ({ page }) => {
			await page.goto(`/${locale}?target=dataset`);
			const ids = tools
				.filter((tool) => (tool.targets ?? []).includes('dataset'))
				.map((tool) => tool.id);
			expect(ids.length).toBeGreaterThan(0);
			await expectFilterResultsVisible(page, ids);
			for (const guide of guides) await expect(cardFor(page, guide.id)).toBeHidden();
			await expect(section(page, 'guides').locator('[data-testid=section-empty]')).toBeVisible();
		});
	});
}
