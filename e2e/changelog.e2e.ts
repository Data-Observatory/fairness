import { expect } from '@playwright/test';
import { test } from './base';
import { LOCALES, loadChangelog, loadTools } from './content';
import { expectRealPage } from './helpers';

const changelog = loadChangelog();
const newest = changelog.map((entry) => entry.date).sort()[changelog.length - 1];
const dates = [...new Set(changelog.map((entry) => entry.date))].sort().reverse();

for (const locale of LOCALES) {
	test.describe(`changelog /${locale}`, () => {
		test.beforeEach(async ({ page }) => {
			await page.goto(`/${locale}/changelog`);
		});

		test('is a real page with one h1', async ({ page }) => {
			await expectRealPage(page, `/${locale}/changelog`);
		});

		test('lists one h2 per date, newest first', async ({ page }) => {
			const headings = await page
				.locator('main [data-testid=changelog-day] h2')
				.evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim()));
			expect(headings).toEqual(dates);
		});

		test('lists the entry texts of each date in the order of the file', async ({ page }) => {
			for (const date of dates) {
				const expected = changelog
					.filter((entry) => entry.date === date)
					.map((e) => e.text[locale]);
				const texts = await page
					.locator(`[data-testid=changelog-day][data-date="${date}"] [data-testid=changelog-text]`)
					.allTextContents();
				expect(texts.map((text) => text.trim())).toEqual(expected);
			}
		});

		test('links every listed tool to its detail page, and the links resolve', async ({
			page,
			request
		}) => {
			const names = new Map(loadTools().map((tool) => [tool.id, tool.name]));
			const expected = changelog.flatMap((entry) => entry.tools ?? []);
			expect(expected.length).toBeGreaterThan(0);
			const links = page.locator('[data-testid=changelog-entry] a[data-tool-id]');
			await expect(links).toHaveCount(expected.length);
			const found = await links.evaluateAll((nodes) =>
				nodes.map((node) => ({
					id: node.getAttribute('data-tool-id'),
					href: node.getAttribute('href'),
					text: node.textContent?.trim()
				}))
			);
			expect(found.map((link) => link.id)).toEqual(expected);
			for (const link of found) {
				expect(link.href).toBe(`/${locale}/tools/${link.id}`);
				expect(link.text).toBe(names.get(link.id!));
			}
			for (const href of new Set(found.map((link) => link.href!))) {
				expect((await request.get(href)).status(), href).toBe(200);
			}
		});

		test('a tool link opens that tool page', async ({ page }) => {
			const link = page.locator('[data-testid=changelog-entry] a[data-tool-id]').first();
			const id = (await link.getAttribute('data-tool-id'))!;
			await link.click();
			await expect(page).toHaveURL(new RegExp(`/${locale}/tools/${id}$`));
			await expect(page.locator('h1')).toContainText(loadTools().find((t) => t.id === id)!.name);
		});
	});
}

test.describe('footer: last updated', () => {
	for (const locale of LOCALES) {
		for (const path of ['', '/about', '/tools/f-uji', '/changelog']) {
			const url = `/${locale}${path}`;
			test(`${url} shows the newest changelog date and links to the changelog`, async ({
				page
			}) => {
				await page.goto(url);
				await expectRealPage(page, url);
				const line = page.locator('footer [data-testid=last-updated]');
				await expect(line).toHaveCount(1);
				await expect(line).toContainText(newest);
				await expect(line).toHaveAttribute('href', `/${locale}/changelog`);
			});
		}
	}

	test('the footer link opens the changelog in the same locale', async ({ page }) => {
		await page.goto('/es/about');
		await page.locator('footer [data-testid=last-updated]').click();
		await expect(page).toHaveURL(/\/es\/changelog$/);
		await expect(page.locator('h1')).toBeVisible();
	});

	test('the wording differs per locale', async ({ page }) => {
		await page.goto('/en');
		const en = await page.locator('footer [data-testid=last-updated]').innerText();
		await page.goto('/es');
		const es = await page.locator('footer [data-testid=last-updated]').innerText();
		expect(en).not.toBe(es);
	});
});
