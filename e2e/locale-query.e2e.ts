import { expect, test } from '@playwright/test';
import { loadTools } from './content';
import { checkbox, resultCount, wholeNumber } from './helpers';

// Review defect: the locale switch dropped the filter query string.

const automated = loadTools().filter((tool) => tool.mode === 'automated');

test.describe('locale switch keeps the filter query', () => {
	test('on /en?mode=automated the es switch points to /es?mode=automated', async ({ page }) => {
		await page.goto('/en?mode=automated');
		await expect(page.locator('[data-testid=locale-switch-es]')).toHaveAttribute(
			'href',
			/^\/es\/?\?mode=automated$/
		);
		await expect(page.locator('[data-testid=locale-switch-en]')).toHaveAttribute(
			'href',
			/^\/en\/?\?mode=automated$/
		);
	});

	test('clicking the es switch restores the selection on /es', async ({ page }) => {
		await page.goto('/en?mode=automated');
		await expect(checkbox(page, 'mode', 'automated')).toBeChecked();
		await page.locator('[data-testid=locale-switch-es]').click();
		await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/es');
		expect(new URL(page.url()).searchParams.get('mode')).toBe('automated');
		await expect(page.locator('html')).toHaveAttribute('lang', 'es');
		await expect(checkbox(page, 'mode', 'automated')).toBeChecked();
		await expect(resultCount(page)).toContainText(wholeNumber(automated.length));
	});

	test('the switch href follows a selection made after load', async ({ page }) => {
		await page.goto('/en');
		await checkbox(page, 'mode', 'automated').check();
		await expect(page.locator('[data-testid=locale-switch-es]')).toHaveAttribute(
			'href',
			/^\/es\/?\?mode=automated$/
		);
	});
});
