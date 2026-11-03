import { expect, type Page } from '@playwright/test';
import { test } from './base';
import { expectRealPage } from './helpers';

// A per-page, hash-based script policy emitted by SvelteKit (`kit.csp`) as a <meta> element in the
// prerendered HTML. The CloudFront header policy still applies, and a browser enforces both, so a
// script has to pass both. The meta cannot carry frame-ancestors (the header keeps that).

const PAGES = [
	'/',
	'/en',
	'/es',
	'/en/about',
	'/es/about',
	'/en/changelog',
	'/es/changelog',
	'/en/tools/f-uji',
	'/es/tools/fair-enough',
	'/en/wizard',
	'/es/wizard',
	'/en/compare',
	'/es/compare',
	'/en/compare?tools=f-uji,fair-enough',
	'/en/wizard?level=advanced&target=dataset&input=doi',
	'/es/wizard?target=dataset&input=doi&step=results'
];

const GOOGLE_HOST =
	/^(www|region\d+)?\.?(googletagmanager|google-analytics|analytics\.google)\.com$/;
const TAG_URL = 'https://www.googletagmanager.com/gtag/js?id=G-X6BJF4NQ71';

const META = 'head meta[http-equiv="content-security-policy"]';

async function open(page: Page, url: string): Promise<void> {
	await page.goto(url);
	if (url === '/') {
		await page.waitForURL((target) => /^\/(en|es)\/?$/.test(target.pathname));
		await expectRealPage(page, new URL(page.url()).pathname);
	} else {
		await expectRealPage(page, url);
	}
}

/** The value of one directive of a policy, as a list of sources. */
function directive(policy: string, name: string): string[] {
	const found = policy
		.split(';')
		.map((part) => part.trim().split(/\s+/))
		.find((parts) => parts[0] === name);
	return found ? found.slice(1) : [];
}

test.describe('hash-based script policy in the page head', () => {
	for (const url of PAGES) {
		test(`${url} has a CSP meta with script hashes and no 'unsafe-inline'`, async ({
			page,
			request
		}) => {
			// The meta must be in the served HTML, not added by a script.
			if (url !== '/') {
				const html = await (await request.get(url.split('?')[0])).text();
				expect(html, url).toMatch(/<meta http-equiv="content-security-policy"/i);
			}

			await open(page, url);
			const metas = page.locator(META);
			await expect(metas).toHaveCount(1);
			const policy = (await metas.getAttribute('content')) ?? '';

			const script = directive(policy, 'script-src');
			expect(script, policy).toContain("'self'");
			expect(script, policy).toContain('https://www.googletagmanager.com');
			expect(script.some((source) => /^'sha256-[A-Za-z0-9+/=]+'$/.test(source))).toBe(true);
			expect(script).not.toContain("'unsafe-inline'");
			expect(directive(policy, 'object-src')).toEqual(["'none'"]);
			expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
			// Styles keep working with inline style attributes: the policy does not restrict them.
			expect(directive(policy, 'style-src')).toEqual([]);
		});
	}
});

test.describe('the consent flow under the policy', () => {
	for (const url of ['/en', '/es/about', '/en/tools/f-uji']) {
		test(`${url}: the tag loads by default with no policy violation`, async ({ page }) => {
			const violations: string[] = [];
			const errors: string[] = [];
			const google: string[] = [];
			await page.addInitScript(() => {
				const seen: string[] = [];
				(window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
				document.addEventListener('securitypolicyviolation', (event) => {
					seen.push(`${event.violatedDirective} ${event.blockedURI}`);
				});
			});
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('request', (request) => {
				if (GOOGLE_HOST.test(new URL(request.url()).hostname)) google.push(request.url());
			});
			await page.route(
				(target) => GOOGLE_HOST.test(target.hostname),
				(route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
			);

			await open(page, url);
			await expect.poll(() => google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
			await page.waitForLoadState('networkidle');

			violations.push(
				...(await page.evaluate(
					() => (window as unknown as { __cspViolations: string[] }).__cspViolations
				))
			);
			expect(violations).toEqual([]);
			expect(errors).toEqual([]);
		});
	}

	test('a script outside the policy is blocked (the listener works)', async ({ page }) => {
		await page.addInitScript(() => {
			const seen: string[] = [];
			(window as unknown as { __cspViolations: string[] }).__cspViolations = seen;
			document.addEventListener('securitypolicyviolation', (event) => {
				seen.push(event.violatedDirective);
			});
		});
		await open(page, '/en');
		await page.evaluate(() => {
			const script = document.createElement('script');
			script.textContent = 'window.__injected = true;';
			document.head.appendChild(script);
		});
		expect(await page.evaluate(() => (window as { __injected?: boolean }).__injected)).toBe(
			undefined
		);
		const seen = await page.evaluate(
			() => (window as unknown as { __cspViolations: string[] }).__cspViolations
		);
		expect(seen.some((item) => item.startsWith('script-src'))).toBe(true);
	});
});
