import { expect, test } from '@playwright/test';
import { LOCALES, loadSite } from './content';

// Review defect: page titles used the English message `site_name` in every locale, and the nav
// brand was hard-coded. Both must come from content/site.yaml.

const site = loadSite();

const PAGES = ['', '/about', '/tools/f-uji', '/tools/fair-enough'];

for (const locale of LOCALES) {
	const other = locale === 'en' ? 'es' : 'en';
	test.describe(`site name /${locale}`, () => {
		for (const path of PAGES) {
			test(`the title of /${locale}${path} contains name.${locale} from site.yaml`, async ({
				page
			}) => {
				await page.goto(`/${locale}${path}`);
				const title = await page.title();
				expect(title).toContain(site.name[locale]);
				if (site.name[other] !== site.name[locale]) {
					expect(title).not.toContain(site.name[other]);
				}
			});
		}

		test('the nav brand text equals shortName from site.yaml', async ({ page }) => {
			expect(site.shortName, 'content/site.yaml must define shortName').toBeDefined();
			await page.goto(`/${locale}/about`);
			await expect(page.locator('header nav a').first()).toHaveText(site.shortName![locale]);
		});
	});
}
