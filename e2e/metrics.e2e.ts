import { expect } from '@playwright/test';
import { test } from './base';
import { LOCALES, loadSite, loadTools, type Locale, type Tool } from './content';
import { expectNoA11yViolations } from './helpers';
import { openCompare, table, tid } from './compare-helpers';

// Citation, GitHub and download numbers are recorded facts of the YAML `metrics` block. They are
// shown on the detail page and in the comparison, with their sources and the date checked. Nothing
// is ranked, scored or sorted by them.

const site = loadSite();
const tools = loadTools();
const withMetrics = tools.filter((tool) => tool.metrics !== undefined);
const withoutMetrics = tools.filter((tool) => tool.metrics === undefined);
const withCitations = (): Tool => {
	const found = tools.find(
		(tool) => (tool.metrics?.citations ?? []).length > 0 && tool.kind === 'tool'
	);
	if (!found) throw new Error('content needs a tool with recorded citations');
	return found;
};

const LABELS = {
	en: { citations: 'Citations', github: 'GitHub activity', downloads: 'Downloads' },
	es: { citations: 'Citas', github: 'Actividad en GitHub', downloads: 'Descargas' }
} as const;

const fact = (page: import('@playwright/test').Page, label: string) =>
	page
		.locator('dl[data-testid=tool-facts] dt', { hasText: label })
		.locator('xpath=following-sibling::dd[1]');

test('the real content records metrics for some entries and not for others', () => {
	expect(withMetrics.length).toBeGreaterThan(0);
	expect(withoutMetrics.length).toBeGreaterThan(0);
});

for (const locale of LOCALES) {
	test.describe(`metrics on the detail page /${locale}`, () => {
		test('f-uji lists its citations, each linked to the DOI', async ({ page }) => {
			const fuji = tools.find((tool) => tool.id === 'f-uji')!;
			const citation = fuji.metrics!.citations![0];
			await page.goto(`/${locale}/tools/f-uji`);
			await expect(
				page.locator('dl[data-testid=tool-facts] dt', { hasText: LABELS[locale].citations })
			).toBeVisible();
			const value = fact(page, LABELS[locale].citations);
			const link = value.getByRole('link', { name: `${citation.count} (${citation.label})` });
			await expect(link).toBeVisible();
			await expect(link).toHaveAttribute('href', `https://doi.org/${citation.doi}`);
		});

		test('f-uji shows the Patterns 2021 citation text', async ({ page }) => {
			await page.goto(`/${locale}/tools/f-uji`);
			await expect(fact(page, LABELS[locale].citations)).toContainText('(Patterns, 2021)');
		});

		test('a tool with metrics shows the note with its sources and the checked date', async ({
			page
		}) => {
			const fuji = tools.find((tool) => tool.id === 'f-uji')!;
			await page.goto(`/${locale}/tools/f-uji`);
			const note = tid(page, 'metrics-note');
			await expect(note).toBeVisible();
			await expect(note).toContainText('OpenAlex');
			await expect(note.locator('time')).toHaveAttribute('datetime', fuji.metrics!.checked);
			await expect(note.locator('time')).toHaveText(fuji.metrics!.checked);
			await expect(note).toContainText(locale === 'en' ? 'not a ranking' : 'no una clasificación');
		});

		test('a tool with GitHub numbers lists them', async ({ page }) => {
			const fuji = tools.find((tool) => tool.id === 'f-uji')!;
			await page.goto(`/${locale}/tools/f-uji`);
			const github = fact(page, LABELS[locale].github);
			await expect(github).toContainText(String(fuji.metrics!.github!.last_push));
		});

		test('every tool without metrics shows no metrics note and no metric fact', async ({
			page
		}) => {
			for (const tool of withoutMetrics) {
				await page.goto(`/${locale}/tools/${tool.id}`);
				await expect(tid(page, 'metrics-note'), tool.id).toHaveCount(0);
				for (const label of Object.values(LABELS[locale])) {
					await expect(
						page.locator('dl[data-testid=tool-facts] dt', { hasText: label }),
						`${tool.id} ${label}`
					).toHaveCount(0);
				}
			}
		});

		test('every tool with metrics shows the note', async ({ page }) => {
			for (const tool of withMetrics) {
				await page.goto(`/${locale}/tools/${tool.id}`);
				await expect(tid(page, 'metrics-note'), tool.id).toBeVisible();
			}
		});

		test('has no accessibility violations on a page with metrics', async ({ page }) => {
			await page.goto(`/${locale}/tools/f-uji`);
			await expect(tid(page, 'metrics-note')).toBeVisible();
			await expectNoA11yViolations(page);
		});
	});

	test.describe(`metrics in the comparison /${locale}`, () => {
		test.skip(site.features.compare === false, 'features.compare is disabled in site.yaml');

		const row = (page: import('@playwright/test').Page, key: string) =>
			table(page).locator(`tbody tr[data-fact=${key}]`);

		test('shows citation and GitHub rows, with "Not recorded" for a tool that has none', async ({
			page
		}) => {
			const none = tools.find((tool) => tool.kind === 'tool' && tool.metrics === undefined);
			const has = withCitations();
			if (!none) throw new Error('content needs a tool without metrics');
			await openCompare(page, locale as Locale, [has.id, none.id]);
			const citations = row(page, 'citations');
			await expect(citations).toBeVisible();
			await expect(citations.locator('th[scope=row]')).toHaveText(LABELS[locale].citations);
			await expect(citations.locator(`td[data-tool-id=${has.id}]`)).not.toHaveAttribute(
				'data-missing',
				''
			);
			await expect(citations.locator(`td[data-tool-id=${none.id}]`)).toHaveAttribute(
				'data-missing',
				''
			);
			await expect(citations.locator(`td[data-tool-id=${none.id}]`)).toHaveText(
				locale === 'en' ? 'Not recorded' : 'No registrado'
			);
		});

		test('shows the note under the table when a selected tool has metrics', async ({ page }) => {
			const has = withCitations();
			const other = tools.find((tool) => tool.kind === 'tool' && tool.id !== has.id)!;
			await openCompare(page, locale as Locale, [has.id, other.id]);
			const note = tid(page, 'compare-metrics-note');
			await expect(note).toBeVisible();
			await expect(note).toContainText(locale === 'en' ? 'not a ranking' : 'no una clasificación');
		});

		test('hides the note when no selected tool has a metric row', async ({ page }) => {
			const none = tools.filter((tool) => tool.kind === 'tool' && tool.metrics === undefined);
			// The unit tests cover this case (hasMetricRows); the page needs two such tools to show a table.
			test.skip(none.length < 2, 'fewer than two comparable tools without metrics');
			await openCompare(page, locale as Locale, [none[0].id, none[1].id]);
			await expect(table(page)).toBeVisible();
			await expect(tid(page, 'compare-metrics-note')).toHaveCount(0);
		});

		test('keeps the columns in selection order (no sorting by numbers)', async ({ page }) => {
			const a = withCitations();
			const b = tools.find((tool) => tool.kind === 'tool' && tool.id !== a.id)!;
			await openCompare(page, locale as Locale, [b.id, a.id]);
			const ids = await table(page)
				.locator('thead th[scope=col]')
				.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-tool-id')));
			expect(ids).toEqual([b.id, a.id]);
		});
	});
}
