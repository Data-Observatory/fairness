import { expect, test, type Page } from '@playwright/test';
import { loadTools } from './content';
import { cards, section, visibleCards } from './helpers';

// Review defect: printing a page with collapsed sections lost their cards, and the card grid
// kept several columns in print.

const tools = loadTools();

const openStates = (page: Page) =>
	page.locator('details').evaluateAll((nodes) => nodes.map((n) => (n as HTMLDetailsElement).open));

async function ready(page: Page) {
	await page.goto('/en');
	// The filter panel is rendered after hydration: its presence means the page is interactive.
	await expect(page.locator('[data-testid=filter-bar] details')).toBeAttached();
	await page.waitForLoadState('networkidle');
}

test.describe('beforeprint and afterprint', () => {
	test('beforeprint opens every details element and every card is visible', async ({ page }) => {
		await ready(page);
		await expect(visibleCards(page)).not.toHaveCount(tools.length);

		await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));

		expect((await openStates(page)).every(Boolean)).toBe(true);
		await expect(cards(page)).toHaveCount(tools.length);
		await expect(visibleCards(page)).toHaveCount(tools.length);
	});

	test('afterprint restores the previous open state', async ({ page }) => {
		await ready(page);
		const before = await openStates(page);
		expect(before).toContain(false);

		await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
		await expect(visibleCards(page)).toHaveCount(tools.length);
		await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

		expect(await openStates(page)).toEqual(before);
		await expect(visibleCards(page)).not.toHaveCount(tools.length);
	});

	test('a section the visitor opened stays open after afterprint', async ({ page }) => {
		await ready(page);
		await section(page, 'other-objects').locator('details > summary').click();
		await expect(section(page, 'other-objects').locator('details')).toHaveAttribute('open', /.*/);
		const before = await openStates(page);

		await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
		await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));

		expect(await openStates(page)).toEqual(before);
	});
});

test.describe('print layout', () => {
	const gridTracks = (page: Page) =>
		section(page, 'datasets')
			.locator('ul:has(> li > [data-testid=tool-card])')
			.first()
			.evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length);

	test('the card grid is a single column in print media', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 });
		await ready(page);
		expect(await gridTracks(page), 'screen layout should have several columns').toBeGreaterThan(1);

		await page.emulateMedia({ media: 'print' });
		expect(await gridTracks(page)).toBe(1);
	});
});
