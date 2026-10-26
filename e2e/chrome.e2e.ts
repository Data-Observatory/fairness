import { expect, test } from '@playwright/test';
import { LOCALES, loadSections, loadSite } from './content';
import { checkbox, expectExternalLink, expectRealPage, section } from './helpers';

const site = loadSite();

const PAGES = ['', '/about', '/tools/f-uji', '/tools/fair-enough', '/wizard'];

test.describe('footer on every page', () => {
	for (const locale of LOCALES) {
		for (const path of PAGES) {
			const url = `/${locale}${path}`;
			test(`${url} renders licences, repository and contribute links`, async ({ page }) => {
				await page.goto(url);
				await expectRealPage(page, url);
				const footer = page.locator('footer');
				await expect(footer).toBeVisible();
				await expectExternalLink(footer.locator(`a[href="${site.repository}"]`), site.repository);
				await expectExternalLink(
					footer.locator(`a[href="${site.contributeUrl}"]`),
					site.contributeUrl
				);
				await expect(footer).toContainText('MIT');
				await expect(footer).toContainText('CC-BY-4.0');
			});
		}
	}
});

test.describe('unknown paths', () => {
	const CASES: [string, RegExp][] = [
		['/en/nope', /Page not found/],
		['/es/nope', /P\u00e1gina no encontrada/],
		['/nope', /Page not found/]
	];
	for (const [path, message] of CASES) {
		test(`${path} answers 404 with the not-found page text`, async ({ request }) => {
			const response = await request.get(path);
			expect(response.status()).toBe(404);
			expect(await response.text()).toMatch(message);
		});
	}
});

test.describe('skip link', () => {
	test('is the first focusable element', async ({ page }) => {
		await page.goto('/en');
		await page.keyboard.press('Tab');
		const first = page.locator(':focus');
		await expect(first).toHaveAttribute('href', '#main-content');
		await expect(first).toBeVisible();
	});

	test('moves focus to main when activated', async ({ page }) => {
		await page.goto('/en');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Enter');
		await expect(page.locator('main#main-content')).toBeFocused();
	});
});

test.describe('keyboard', () => {
	test('filter checkboxes toggle with Space', async ({ page }) => {
		await page.goto('/en');
		const box = checkbox(page, 'mode', 'automated');
		await box.focus();
		await page.keyboard.press('Space');
		await expect(box).toBeChecked();
		await page.keyboard.press('Space');
		await expect(box).not.toBeChecked();
	});

	test('a section summary toggles with Enter and with Space', async ({ page }) => {
		await page.goto('/en');
		const collapsed = loadSections().find((item) => item.collapsed);
		expect(collapsed).toBeDefined();
		const details = section(page, collapsed!.id).locator('details');
		const summary = details.locator('> summary');
		await summary.focus();

		await page.keyboard.press('Enter');
		await expect(details).toHaveAttribute('open', /.*/);
		await page.keyboard.press('Enter');
		await expect(details).not.toHaveAttribute('open', /.*/);

		await page.keyboard.press('Space');
		await expect(details).toHaveAttribute('open', /.*/);
		await page.keyboard.press('Space');
		await expect(details).not.toHaveAttribute('open', /.*/);
	});

	test('the filter panel summary toggles with Enter and with Space on mobile', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		await page.goto('/en');
		const details = page.locator('[data-testid=filter-bar] details');
		await expect(details).toBeAttached();
		const summary = details.locator('> summary');
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(details).toHaveAttribute('open', /.*/);
		await page.keyboard.press('Space');
		await expect(details).not.toHaveAttribute('open', /.*/);
	});
});

test.describe('privacy statement', () => {
	test('/en/about states it exactly', async ({ page }) => {
		await page.goto('/en/about');
		await expect(
			page
				.locator('main')
				.getByText(
					'This site collects no data and sets no cookies. Links lead to third-party tools, which have their own privacy policies.',
					{ exact: true }
				)
		).toBeVisible();
	});
});
