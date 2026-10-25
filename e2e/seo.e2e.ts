import { expect, test } from '@playwright/test';
import { LOCALES, loadSite } from './content';

// Every page head carries a canonical link and hreflang alternates for both locales plus
// x-default (the /en equivalent). The domain comes from content/site.yaml.

const site = loadSite() as { domain: string };
const origin = `https://${site.domain}`;

const CASES = [
	{ path: '', label: 'home' },
	{ path: '/about', label: 'about' },
	{ path: '/tools/f-uji', label: 'tool detail' }
];

for (const locale of LOCALES) {
	for (const { path, label } of CASES) {
		test(`/${locale}${path} (${label}) has canonical and hreflang alternates`, async ({ page }) => {
			await page.goto(`/${locale}${path}`);
			await expect(page.locator('head link[rel=canonical]')).toHaveCount(1);
			await expect(page.locator('head link[rel=canonical]')).toHaveAttribute(
				'href',
				`${origin}/${locale}${path}`
			);
			const alternates = await page
				.locator('head link[rel=alternate][hreflang]')
				.evaluateAll((nodes) =>
					nodes.map((node) => [node.getAttribute('hreflang'), node.getAttribute('href')])
				);
			expect(alternates).toEqual([
				['en', `${origin}/en${path}`],
				['es', `${origin}/es${path}`],
				['x-default', `${origin}/en${path}`]
			]);
		});
	}
}
