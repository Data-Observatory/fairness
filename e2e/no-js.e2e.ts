import { expect, test } from '@playwright/test';
import { LOCALES, loadTools } from './content';
import { cardFor, cards, expandAllSections, expectExternalLink, visibleCards } from './helpers';

const tools = loadTools();

test.use({ javaScriptEnabled: false });

for (const locale of LOCALES) {
	test.describe(`JavaScript disabled /${locale}`, () => {
		test('shows every card and the external links work as plain links', async ({ page }) => {
			await page.goto(`/${locale}`);
			await expect(page.locator('h1')).toBeVisible();
			await expect(cards(page)).toHaveCount(tools.length);

			// Native <details> still opens without JavaScript.
			await expandAllSections(page);
			await expect(visibleCards(page)).toHaveCount(tools.length);

			for (const tool of tools) {
				await expectExternalLink(
					cardFor(page, tool.id).locator('[data-testid=open-tool]'),
					tool.url
				);
			}
		});

		test('the details link opens the prerendered detail page', async ({ page }) => {
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await cardFor(page, 'f-uji').locator('[data-testid=tool-details]').click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/tools/f-uji/?$`));
			await expect(page.locator('h1')).toContainText('F-UJI');
			await expect(page.locator('dl[data-testid=tool-facts]')).toBeVisible();
		});

		test('the finder table and the about page work', async ({ page }) => {
			await page.goto(`/${locale}`);
			await expect(page.locator('table[data-testid=finder-table]')).toBeVisible();
			await page.goto(`/${locale}/about`);
			await expect(page.locator('h1')).toBeVisible();
		});
	});
}
