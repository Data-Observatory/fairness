import { test } from '@playwright/test';
import { expandAllSections, expectNoA11yViolations, expectRealPage } from './helpers';

const PAGES = [
	'/en',
	'/es',
	'/en/about',
	'/es/about',
	'/en/tools/f-uji',
	'/es/tools/f-uji',
	'/en/wizard',
	'/es/wizard'
];

// States of the guided finder: simple results, advanced with answers (some options disabled) and
// an empty result.
const WIZARD_STATES = [
	'/en/wizard?target=dataset&input=doi&step=results',
	'/es/wizard?target=dataset&input=doi&step=results',
	'/en/wizard?level=advanced&target=ontology',
	'/es/wizard?level=advanced&target=ontology',
	'/en/wizard?target=dataset&input=ontology_uri&step=results'
];

test.describe('accessibility (WCAG 2.2 AA)', () => {
	for (const url of PAGES) {
		test(`${url} has no violations`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			await expectNoA11yViolations(page);
		});
	}

	for (const url of WIZARD_STATES) {
		test(`${url} has no violations`, async ({ page }) => {
			await page.goto(url);
			await expectRealPage(page, url);
			await expectNoA11yViolations(page);
		});
	}

	for (const locale of ['en', 'es']) {
		test(`/${locale} has no violations with every section expanded and a filter selected`, async ({
			page
		}) => {
			await page.goto(`/${locale}`);
			await expandAllSections(page);
			await page
				.locator('fieldset[data-filter-group=mode] input[type=checkbox][value=automated]')
				.check();
			await expectNoA11yViolations(page);
		});
	}
});
