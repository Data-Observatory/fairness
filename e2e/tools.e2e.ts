import { expect, test } from '@playwright/test';
import { LOCALES, loadTools } from './content';
import { cardFor, expandAllSections, expectExternalLink } from './helpers';

const tools = loadTools();

test('the content has tools to test', () => {
	expect(tools.length).toBeGreaterThanOrEqual(16);
});

for (const locale of LOCALES) {
	test.describe(`detail pages /${locale}`, () => {
		for (const tool of tools) {
			test(`${tool.id} exists with facts, last verified and the open link`, async ({ page }) => {
				const response = await page.goto(`/${locale}/tools/${tool.id}`);
				expect(response?.status()).toBe(200);
				await expect(page.locator('html')).toHaveAttribute('lang', locale);
				await expect(page.locator('h1')).toContainText(tool.name);
				await expect(page.locator('dl[data-testid=tool-facts]')).toBeVisible();
				await expect(page.locator('dl[data-testid=tool-facts] dt').first()).toBeVisible();
				await expect(page.locator('[data-testid=last-verified]')).toContainText(
					String(tool.last_verified)
				);
				await expectExternalLink(page.locator('[data-testid=open-tool]'), tool.url);
				await expect(page.locator('main')).toContainText(new URL(tool.url).host);
			});
		}
	});
}

test.describe('reachability from the home page', () => {
	test('every card details link leads to its own detail page', async ({ page }) => {
		for (const tool of tools) {
			await page.goto('/en');
			await expandAllSections(page);
			await cardFor(page, tool.id).locator('[data-testid=tool-details]').click();
			await expect(page).toHaveURL(new RegExp(`/en/tools/${tool.id}/?$`));
			await expect(page.locator('h1')).toContainText(tool.name);
		}
	});
});
