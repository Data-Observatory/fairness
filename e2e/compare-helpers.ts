import { expect, type Locator, type Page } from '@playwright/test';
import { loadComparable, loadSections, loadTools, type Locale, type Tool } from './content';

// Locators and helpers for the comparison page (/compare). Tool ids come from content/tools at
// runtime (kind tool only, in home order), never from literals.

export const comparable = (): Tool[] => loadComparable();
export const comparableIds = (): string[] => comparable().map((tool) => tool.id);

export const compareUrl = (locale: Locale, ids: string[] | string = []): string => {
	const list = typeof ids === 'string' ? ids : ids.join(',');
	return `/${locale}/compare${list === '' ? '' : `?tools=${list}`}`;
};

export const tid = (page: Page, id: string): Locator => page.locator(`[data-testid=${id}]`);

export const picker = (page: Page): Locator => tid(page, 'compare-picker');
export const toolBox = (page: Page, id: string): Locator =>
	picker(page).locator(`input[type=checkbox][name=tools][value=${id}]`);
export const allBoxes = (page: Page): Locator => picker(page).locator('input[type=checkbox]');
export const status = (page: Page): Locator =>
	page.getByRole('status').and(page.locator('[data-testid=compare-status]'));
export const table = (page: Page): Locator => page.locator('table[data-testid=compare-table]');
export const columnHeaders = (page: Page): Locator => table(page).locator('thead th[scope=col]');

/** Waits for hydration: the picker only exists after the page read its state. */
export async function openCompare(page: Page, locale: Locale, ids: string[] | string = []) {
	await page.goto(compareUrl(locale, ids));
	await expect(picker(page)).toBeVisible();
}

/** Ids of the tool columns, in order. */
export const columnIds = (page: Page): Promise<(string | null)[]> =>
	columnHeaders(page).evaluateAll((nodes) =>
		nodes.map((node) => node.getAttribute('data-tool-id'))
	);

/** Ids in the `tools` parameter of the current address. */
export const urlTools = (page: Page): string[] =>
	(new URL(page.url()).searchParams.get('tools') ?? '').split(',').filter((id) => id !== '');

/** A pair of comparable tools where exactly one records a license. */
export function pairWithMissingLicense(): [Tool, Tool] {
	const withLicense = comparable().find((tool) => tool.license !== undefined);
	const without = comparable().find((tool) => tool.license === undefined);
	if (!withLicense || !without)
		throw new Error('content needs a tool with and one without license');
	return [withLicense, without];
}

export const sectionsWithTools = (): { id: string; tools: Tool[] }[] =>
	loadSections()
		.map((item) => ({
			id: item.id,
			tools: loadTools().filter((tool) => tool.section === item.id && tool.kind === 'tool')
		}))
		.filter((item) => item.tools.length > 0);
