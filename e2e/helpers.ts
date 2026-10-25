import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { loadSections, loadTools } from './content';

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
 *
 * The summaries are clicked in one atomic in-page step. A count() followed by a Playwright click()
 * is a check-then-act race: when the page hydrates in between with a filter in the URL, it opens
 * every section itself, the summary the click was waiting for stops matching, and the click waits
 * until the test timeout.
 */
export async function expandAllSections(page: Page): Promise<void> {
	const closed = page.locator('section[data-section-id] details:not([open]) > summary');
	await closed.evaluateAll((summaries) => {
		for (const summary of summaries) (summary as HTMLElement).click();
	});
	await expect(closed).toHaveCount(0);
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
 * the page must be a real page of its route. Strengthened in the M4 review fixes: it now needs
 * exactly one visible h1 on every route plus real, route-specific elements (cards and caveats
 * and filter bar on home, name/open link/facts on a detail page, caveats and privacy on about).
 * A route it does not know is an error, so a typo cannot pass silently. Query and hash are
 * ignored. It does not apply to the bare root, which only redirects.
 */
export async function expectRealPage(page: Page, url: string): Promise<void> {
	const path = url.split(/[?#]/)[0].replace(/\/$/, '');
	const h1 = page.locator('h1');
	await expect(h1).toHaveCount(1);
	await expect(h1).toBeVisible();
	await expect(h1).not.toBeEmpty();

	const detail = /^\/(en|es)\/tools\/([^/]+)$/.exec(path);
	if (detail) {
		const tool = loadTools().find((item) => item.id === detail[2]);
		if (!tool) throw new Error(`expectRealPage: unknown tool in ${url}`);
		await expect(h1).toContainText(tool.name);
		await expect(page.locator('dl[data-testid=tool-facts]')).toBeVisible();
		await expect(page.locator('dl[data-testid=tool-facts] dt').first()).toBeVisible();
		await expect(page.locator('[data-testid=open-tool]')).toHaveAttribute('href', tool.url);
	} else if (/^\/(en|es)$/.test(path)) {
		await expect(page.locator('[data-testid=tool-card]')).toHaveCount(loadTools().length);
		await expect(page.locator('section[data-section-id]')).toHaveCount(loadSections().length);
		await expect(page.locator('[data-testid=caveats]')).toBeVisible();
		await expect(page.locator('[data-testid=filter-bar]')).toBeVisible();
		await expect(page.locator('[data-testid=result-count]')).toBeVisible();
	} else if (/^\/(en|es)\/about$/.test(path)) {
		await expect(page.locator('[data-testid=caveats]')).toBeVisible();
		await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible();
		await expect(
			page
				.locator('main p')
				.filter({ hasText: /cookies/i })
				.first()
		).toBeVisible();
	} else {
		throw new Error(`expectRealPage: no check is defined for ${url}`);
	}
}

export const checkbox = (page: Page, group: string, value: string): Locator =>
	page.locator(`fieldset[data-filter-group=${group}] input[type=checkbox][value=${value}]`);

export const resultCount = (page: Page): Locator =>
	page.getByRole('status').and(page.locator('[data-testid=result-count]'));

/**
 * Asserts that the cards counted by the result-count are exactly the visible ones, WITHOUT
 * opening any section by hand: sections with matches must be open (when collapsed), sections
 * without matches must show their empty message.
 */
export async function expectFilterResultsVisible(page: Page, expectedIds: string[]): Promise<void> {
	await expect(resultCount(page)).toContainText(wholeNumber(expectedIds.length));
	await expect(visibleCards(page)).toHaveCount(expectedIds.length);
	const shown = await visibleCards(page).evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute('data-tool-id'))
	);
	expect(shown.sort()).toEqual([...expectedIds].sort());

	const tools = loadTools();
	for (const item of loadSections()) {
		const inSection = tools.filter(
			(tool) => tool.section === item.id && expectedIds.includes(tool.id)
		);
		const block = section(page, item.id);
		if (inSection.length > 0) {
			const details = block.locator('details');
			if ((await details.count()) > 0) {
				await expect(details, `section ${item.id} has matches and must be open`).toHaveAttribute(
					'open',
					/.*/
				);
			}
		} else {
			await expect(
				block.locator('[data-testid=section-empty]'),
				`section ${item.id} has no matches and must show its empty message`
			).toBeVisible();
		}
	}
}

/** Heading levels (1 to 6) of the document in DOM order. */
export const headingLevels = (page: Page): Promise<number[]> =>
	page
		.locator('h1, h2, h3, h4, h5, h6')
		.evaluateAll((nodes) => nodes.map((node) => Number(node.tagName.slice(1))));

/** One h1 first, and no heading more than one level deeper than the previous one. */
export async function expectNoSkippedHeadingLevels(page: Page): Promise<void> {
	const levels = await headingLevels(page);
	expect(levels.length).toBeGreaterThan(1);
	expect(levels[0]).toBe(1);
	expect(levels.filter((level) => level === 1)).toHaveLength(1);
	levels.forEach((level, index) => {
		if (index === 0) return;
		expect(
			level,
			`heading #${index} (h${level}) follows h${levels[index - 1]} in [${levels.join(',')}]`
		).toBeLessThanOrEqual(levels[index - 1] + 1);
	});
}
