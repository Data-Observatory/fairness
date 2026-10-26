import { expect, test } from '@playwright/test';

const path = (url: string) => new URL(url).pathname.replace(/\/$/, '');

test.describe('locale switch keeps the page path', () => {
	for (const page of ['', '/about', '/tools/f-uji', '/wizard']) {
		test(`/en${page} and /es${page} switch to each other`, async ({ page: browserPage }) => {
			await browserPage.goto(`/en${page}`);
			await browserPage.locator('[data-testid=locale-switch-es]').click();
			await browserPage.waitForURL((url) => path(url.href) === `/es${page}`);
			await expect(browserPage.locator('html')).toHaveAttribute('lang', 'es');

			await browserPage.locator('[data-testid=locale-switch-en]').click();
			await browserPage.waitForURL((url) => path(url.href) === `/en${page}`);
			await expect(browserPage.locator('html')).toHaveAttribute('lang', 'en');
		});
	}
});

test.describe('root redirect by browser language', () => {
	test.describe('Spanish-preferring browser', () => {
		test.use({ locale: 'es-CL' });

		test('/ redirects to /es', async ({ page }) => {
			await page.goto('/');
			await page.waitForURL((url) => path(url.href) === '/es');
			await expect(page.locator('html')).toHaveAttribute('lang', 'es');
			await expect(page.locator('h1')).toBeVisible();
		});
	});

	test.describe('English-preferring browser', () => {
		test.use({ locale: 'en-US' });

		test('/ redirects to /en', async ({ page }) => {
			await page.goto('/');
			await page.waitForURL((url) => path(url.href) === '/en');
			await expect(page.locator('html')).toHaveAttribute('lang', 'en');
			await expect(page.locator('h1')).toBeVisible();
		});
	});
});
