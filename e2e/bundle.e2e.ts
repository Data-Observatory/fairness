import { expect, test, type Response } from '@playwright/test';

// Review defect: the whole content pipeline (yaml parser, zod, raw YAML) shipped to the client
// so the page could filter. The client needs only the view data.

for (const url of ['/en', '/es']) {
	test(`${url} requests no JavaScript that carries the content pipeline`, async ({ page }) => {
		const scripts: Response[] = [];
		page.on('response', (response) => {
			if (new URL(response.url()).pathname.endsWith('.js')) scripts.push(response);
		});

		await page.goto(url);
		await page.waitForLoadState('networkidle');
		expect(scripts.length).toBeGreaterThan(0);

		for (const response of scripts) {
			const body = await response.text();
			expect(body, `${response.url()} mentions ZodError`).not.toContain('ZodError');
			expect(body, `${response.url()} embeds raw YAML`).not.toContain('yaml-language-server');
		}
	});
}
