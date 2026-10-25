import { expect, test } from '@playwright/test';
import { checkbox } from './helpers';

// Review defect: on mobile a shared filtered URL loaded with the filter panel closed, so the
// active selection was invisible.

test.describe('filter panel state on mobile (375px)', () => {
	test.use({ viewport: { width: 375, height: 812 } });

	test('/en?mode=manual loads with the filter panel open', async ({ page }) => {
		await page.goto('/en?mode=manual');
		const panel = page.locator('[data-testid=filter-bar] details');
		await expect(panel).toHaveAttribute('open', /.*/);
		await expect(checkbox(page, 'mode', 'manual')).toBeChecked();
		await expect(checkbox(page, 'mode', 'manual')).toBeVisible();
	});

	test('/en loads with the filter panel closed', async ({ page }) => {
		await page.goto('/en');
		const panel = page.locator('[data-testid=filter-bar] details');
		await expect(panel).toBeAttached();
		await expect(panel).not.toHaveAttribute('open', /.*/);
		await expect(checkbox(page, 'mode', 'manual')).toBeHidden();
	});

	test('an unknown value only (?mode=bogus) counts as no filter and keeps the panel closed', async ({
		page
	}) => {
		await page.goto('/en?mode=bogus');
		const panel = page.locator('[data-testid=filter-bar] details');
		await expect(panel).toBeAttached();
		await expect(panel).not.toHaveAttribute('open', /.*/);
	});
});
