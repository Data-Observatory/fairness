import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

export const cards = (page: Page): Locator => page.locator('[data-testid=tool-card]');
export const visibleCards = (page: Page): Locator =>
	page.locator('[data-testid=tool-card]:visible');
export const cardFor = (page: Page, id: string): Locator =>
	page.locator(`[data-testid=tool-card][data-tool-id=${id}]`);
export const section = (page: Page, id: string): Locator =>
	page.locator(`section[data-section-id=${id}]`);

/**
 * Opens every collapsed section by clicking its native summary. This needs no JavaScript, so it
 * also works in the JavaScript-disabled project.
 */
export async function expandAllSections(page: Page): Promise<void> {
	const closed = page.locator('section[data-section-id] details:not([open]) > summary');
	while ((await closed.count()) > 0) {
		await closed.first().click();
	}
}

/** Matches `n` as a whole number inside a text such as "12 resources shown". */
export const wholeNumber = (n: number): RegExp => new RegExp(`(^|\\D)${n}(\\D|$)`);

export async function expectNoA11yViolations(page: Page): Promise<void> {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
		.analyze();
	expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

export async function expectExternalLink(link: Locator, href: string): Promise<void> {
	await expect(link).toHaveAttribute('href', href);
	await expect(link).toHaveAttribute('target', '_blank');
	await expect(link).toHaveAttribute('rel', /noopener/);
	await expect(link).toHaveAttribute('rel', /noreferrer/);
}

/**
 * Guards generic checks (axe, layout, privacy) against passing on a 404 page or a placeholder:
 * the page must show the content it is supposed to show.
 */
export async function expectRealPage(page: Page, url: string): Promise<void> {
	if (url.includes('/tools/')) {
		await expect(page.locator('dl[data-testid=tool-facts]')).toBeVisible();
	} else if (/^\/(en|es)$/.test(url)) {
		await expect(page.locator('[data-testid=tool-card]').first()).toBeAttached();
	} else if (/^\/(en|es)\/about$/.test(url)) {
		await expect(
			page
				.locator('main p')
				.filter({ hasText: /cookies/i })
				.first()
		).toBeVisible();
	}
}
