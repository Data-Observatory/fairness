import { expect, test, type Page } from '@playwright/test';
import { expectNoA11yViolations, expectRealPage } from './helpers';

// Owner decisions 2026-11-02 (D7): the Google tag loads only after the visitor accepts. Accept and
// Reject have equal weight, the question is asked again after 365 days, and the choice can be
// changed from the footer and from the About page. Google hosts are stubbed so test runs send no
// hits to Google; the requests are still observed.

const GOOGLE_HOST =
	/^(www|region\d+)?\.?(googletagmanager|google-analytics|analytics\.google)\.com$/;
const TAG_URL = 'https://www.googletagmanager.com/gtag/js?id=G-X6BJF4NQ71';
const KEY = 'fair-consent';

const PAGES = [
	'/',
	'/en',
	'/es',
	'/en/about',
	'/es/about',
	'/en/tools/f-uji',
	'/es/tools/f-uji',
	'/en/tools/fair-enough',
	'/es/tools/fair-eva',
	'/en/wizard',
	'/es/wizard',
	'/en/wizard?level=advanced&target=dataset&input=doi',
	'/es/wizard?target=dataset&input=doi&step=results'
];

const TEXT = {
	en: { accept: 'Accept analytics', reject: 'Reject', change: 'Change cookie choice' },
	es: { accept: 'Aceptar analítica', reject: 'Rechazar', change: 'Cambiar la elección de cookies' }
} as const;

const banner = (page: Page) => page.getByTestId('consent-banner');
const accept = (page: Page) => page.getByTestId('consent-accept');
const reject = (page: Page) => page.getByTestId('consent-reject');
// Rendered only after hydration, so its presence also shows that the page is interactive.
const footerChange = (page: Page) => page.locator('footer').getByTestId('consent-change');

/** Stubs the Google hosts and returns the list of requests made to them (filled as they happen). */
async function watchGoogle(page: Page): Promise<string[]> {
	const requests: string[] = [];
	page.on('request', (request) => {
		if (GOOGLE_HOST.test(new URL(request.url()).hostname)) requests.push(request.url());
	});
	await page.route(
		(target) => GOOGLE_HOST.test(target.hostname),
		(route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
	);
	return requests;
}

async function open(page: Page, url: string): Promise<void> {
	await page.goto(url);
	if (url === '/') {
		await page.waitForURL((target) => /^\/(en|es)\/?$/.test(target.pathname));
		await expectRealPage(page, new URL(page.url()).pathname);
	} else {
		await expectRealPage(page, url);
	}
}

const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), KEY);

/** Seeds a stored choice before the page's own scripts run (only when none is stored yet). */
async function seed(page: Page, choice: string, daysAgo: number, version = 1): Promise<void> {
	await page.addInitScript(
		([key, value, days, v]) => {
			try {
				if (window.localStorage.getItem(key) !== null) return;
				const date = new Date();
				date.setDate(date.getDate() - Number(days));
				const iso = [
					date.getFullYear(),
					String(date.getMonth() + 1).padStart(2, '0'),
					String(date.getDate()).padStart(2, '0')
				].join('-');
				window.localStorage.setItem(key, JSON.stringify({ v, choice: value, date: iso }));
			} catch {
				// Storage is not available: nothing to seed.
			}
		},
		[KEY, choice, daysAgo, version] as const
	);
}

const setCookies = (page: Page) =>
	page.evaluate(() => {
		document.cookie = '_ga=GA1.1.1.1; path=/';
		document.cookie = '_ga_X6BJF4NQ71=GS2.1.1; path=/';
		document.cookie = 'theme=plain; path=/';
	});
const cookieNames = (page: Page) =>
	page.evaluate(() =>
		document.cookie
			.split('; ')
			.filter(Boolean)
			.map((pair) => pair.split('=')[0])
	);

test.describe('before a choice', () => {
	for (const url of PAGES) {
		test(`${url} shows the banner and sends no Google request`, async ({ page }) => {
			const google = await watchGoogle(page);
			await open(page, url);
			await expect(banner(page)).toBeVisible();
			await expect(accept(page)).toBeVisible();
			await expect(reject(page)).toBeVisible();
			await page.waitForLoadState('networkidle');
			expect(google).toEqual([]);
			expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0);
			expect(await stored(page)).toBeNull();
		});
	}

	for (const locale of ['en', 'es'] as const) {
		test(`/${locale} banner buttons have the expected names`, async ({ page }) => {
			await open(page, `/${locale}`);
			await expect(banner(page).getByRole('button', { name: TEXT[locale].accept })).toBeVisible();
			await expect(banner(page).getByRole('button', { name: TEXT[locale].reject })).toBeVisible();
		});
	}

	test('Accept and Reject have the same size and style', async ({ page }) => {
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		const style = (button: ReturnType<typeof accept>) =>
			button.evaluate((element) => {
				const css = getComputedStyle(element);
				const box = element.getBoundingClientRect();
				return {
					color: css.color,
					background: css.backgroundColor,
					border: css.borderTopColor + css.borderTopWidth,
					font: css.fontSize + css.fontWeight,
					height: Math.round(box.height)
				};
			});
		expect(await style(reject(page))).toEqual(await style(accept(page)));
	});

	test('the banner is in the normal flow, right after the skip link, and is not fixed', async ({
		page
	}) => {
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		expect(await banner(page).evaluate((element) => getComputedStyle(element).position)).toBe(
			'static'
		);
		const order = await page.evaluate(() => {
			const all = Array.from(
				document.body.querySelectorAll('a[href="#main-content"], header, section')
			);
			return all.map((element) => element.getAttribute('data-testid') ?? element.tagName);
		});
		expect(order.slice(0, 3)).toEqual(['A', 'consent-banner', 'HEADER']);
	});

	test('the page does not scroll sideways at 375 px with the banner shown', async ({ page }) => {
		await page.setViewportSize({ width: 375, height: 812 });
		for (const url of ['/en', '/es', '/en/about', '/en/wizard', '/es/tools/f-uji']) {
			await open(page, url);
			await expect(banner(page)).toBeVisible();
			const { scrollWidth, innerWidth } = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				innerWidth: window.innerWidth
			}));
			expect(scrollWidth, url).toBeLessThanOrEqual(innerWidth);
		}
	});

	test('the loader script is served and the HTML carries no inline Google tag', async ({
		request
	}) => {
		const loader = await request.get('/consent-loader.js');
		expect(loader.ok()).toBe(true);
		expect(await loader.text()).toContain('fair-consent');
		for (const url of ['/en', '/es/about', '/en/tools/f-uji']) {
			const html = await (await request.get(url)).text();
			expect(html, url).toContain('consent-loader.js');
			// The host appears in the CSP meta (script-src) and nowhere else: no script or link
			// in the HTML refers to it.
			const withoutPolicy = html.replace(/<meta http-equiv="content-security-policy"[^>]*>/i, '');
			expect(withoutPolicy, url).not.toContain('googletagmanager');
			expect(html, url).not.toContain('G-X6BJF4NQ71');
		}
	});
});

test.describe('Reject', () => {
	for (const url of PAGES) {
		test(`${url} keeps Google silent after Reject and after a reload`, async ({ page }) => {
			const google = await watchGoogle(page);
			await open(page, url);
			await reject(page).click();
			await expect(banner(page)).toHaveCount(0);
			await page.waitForLoadState('networkidle');
			expect(google).toEqual([]);
			expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ v: 1, choice: 'denied' });

			await page.reload();
			await expect(footerChange(page)).toBeVisible();
			await page.waitForLoadState('networkidle');
			await expect(banner(page)).toHaveCount(0);
			expect(google).toEqual([]);
		});
	}

	test('deletes _ga cookies and keeps other cookies', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/en');
		await setCookies(page);
		await reject(page).click();
		await expect(banner(page)).toHaveCount(0);
		expect(await cookieNames(page)).toEqual(['theme']);
	});
});

test.describe('Accept', () => {
	for (const url of ['/en', '/es', '/en/about', '/es/tools/f-uji', '/en/wizard']) {
		test(`${url} loads gtag.js once for the configured id, also after a reload`, async ({
			page
		}) => {
			const google = await watchGoogle(page);
			await open(page, url);
			expect(google).toEqual([]);
			await accept(page).click();
			await expect(banner(page)).toHaveCount(0);
			await expect.poll(() => google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
			expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ v: 1, choice: 'granted' });
			expect(await page.evaluate(() => typeof (window as { gtag?: unknown }).gtag)).toBe(
				'function'
			);

			google.length = 0;
			await page.reload();
			await expect(footerChange(page)).toBeVisible();
			await page.waitForLoadState('networkidle');
			await expect(banner(page)).toHaveCount(0);
			expect(
				google.filter((item) => item.startsWith('https://www.googletagmanager.com/gtag/js'))
			).toEqual([TAG_URL]);
		});
	}

	test('navigating inside the site does not load the tag again', async ({ page }) => {
		const google = await watchGoogle(page);
		await open(page, '/en');
		await accept(page).click();
		await expect.poll(() => google.length).toBeGreaterThan(0);
		await page.getByRole('link', { name: 'About', exact: true }).first().click();
		await expect(page).toHaveURL(/\/en\/about\/?$/);
		await page.waitForLoadState('networkidle');
		expect(google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
		await expect(banner(page)).toHaveCount(0);
	});

	test('a choice made 364 days ago still applies', async ({ page }) => {
		const google = await watchGoogle(page);
		await seed(page, 'granted', 364);
		await page.goto('/en');
		await expect(footerChange(page)).toBeVisible();
		await expect(banner(page)).toHaveCount(0);
		await expect.poll(() => google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
	});
});

test.describe('expired or unknown stored choices', () => {
	test('a granted choice older than 365 days asks again and loads nothing', async ({ page }) => {
		const google = await watchGoogle(page);
		await seed(page, 'granted', 366);
		await page.goto('/en');
		await expect(banner(page)).toBeVisible();
		await page.waitForLoadState('networkidle');
		expect(google).toEqual([]);
	});

	test('a denied choice older than 365 days asks again', async ({ page }) => {
		await watchGoogle(page);
		await seed(page, 'denied', 366);
		await page.goto('/es');
		await expect(banner(page)).toBeVisible();
	});

	test('a stored value in another version asks again and loads nothing', async ({ page }) => {
		const google = await watchGoogle(page);
		await seed(page, 'granted', 1, 2);
		await page.goto('/en');
		await expect(banner(page)).toBeVisible();
		await page.waitForLoadState('networkidle');
		expect(google).toEqual([]);
	});

	test('a malformed stored value asks again and loads nothing', async ({ page }) => {
		const google = await watchGoogle(page);
		await page.addInitScript((key) => window.localStorage.setItem(key, 'granted'), KEY);
		await page.goto('/en');
		await expect(banner(page)).toBeVisible();
		await page.waitForLoadState('networkidle');
		expect(google).toEqual([]);
	});

	test('a denied choice made today keeps the banner away', async ({ page }) => {
		const google = await watchGoogle(page);
		await seed(page, 'denied', 0);
		await page.goto('/en');
		await expect(footerChange(page)).toBeVisible();
		await expect(banner(page)).toHaveCount(0);
		expect(google).toEqual([]);
	});
});

test.describe('storage that throws', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(window, 'localStorage', {
				configurable: true,
				get() {
					throw new DOMException('blocked', 'SecurityError');
				}
			});
		});
	});

	test('the page works, the banner shows and nothing is sent to Google', async ({ page }) => {
		const google = await watchGoogle(page);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		await page.waitForLoadState('networkidle');
		expect(google).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('Reject hides the banner without an error', async ({ page }) => {
		const google = await watchGoogle(page);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await open(page, '/es/about');
		await reject(page).click();
		await expect(banner(page)).toHaveCount(0);
		await page.waitForLoadState('networkidle');
		expect(google).toEqual([]);
		expect(errors).toEqual([]);
	});

	test('Accept loads the tag for this page view only, without an error', async ({ page }) => {
		const google = await watchGoogle(page);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await open(page, '/en');
		await accept(page).click();
		await expect(banner(page)).toHaveCount(0);
		await expect.poll(() => google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
		expect(errors).toEqual([]);
	});
});

test.describe('keyboard', () => {
	test('Tab reaches Accept and Reject, in that order, after the skip link', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		await page.keyboard.press('Tab');
		await expect(page.locator(':focus')).toHaveAttribute('href', '#main-content');
		await page.keyboard.press('Tab');
		await expect(accept(page)).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(reject(page)).toBeFocused();
	});

	test('Enter on Reject records the choice and moves focus to the main content', async ({
		page
	}) => {
		const google = await watchGoogle(page);
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(reject(page)).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(banner(page)).toHaveCount(0);
		await expect(page.locator('main#main-content')).toBeFocused();
		expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ choice: 'denied' });
		expect(google).toEqual([]);
	});

	test('Enter on Accept loads the tag and moves focus to the main content', async ({ page }) => {
		const google = await watchGoogle(page);
		await open(page, '/es');
		await expect(banner(page)).toBeVisible();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(accept(page)).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(banner(page)).toHaveCount(0);
		await expect(page.locator('main#main-content')).toBeFocused();
		await expect.poll(() => google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
	});

	test('focus stays where it is when it was outside the banner', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		const link = page.locator('header nav a').first();
		await link.focus();
		await expect(link).toBeFocused();
		await reject(page).dispatchEvent('click');
		await expect(banner(page)).toHaveCount(0);
		await expect(link).toBeFocused();
	});

	test('the banner does not take focus when the page loads', async ({ page }) => {
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		expect(
			await page.evaluate(
				() => document.activeElement === document.body || document.activeElement === null
			)
		).toBe(true);
	});
});

test.describe('change the choice', () => {
	for (const locale of ['en', 'es'] as const) {
		test(`/${locale}/about: the control brings the banner back after Reject`, async ({ page }) => {
			const google = await watchGoogle(page);
			await open(page, `/${locale}/about`);
			await reject(page).click();
			await expect(banner(page)).toHaveCount(0);
			const control = page.locator('main').getByTestId('consent-change');
			await expect(control).toHaveText(TEXT[locale].change);
			await control.click();
			await expect(banner(page)).toBeVisible();
			expect(await stored(page)).toBeNull();
			await accept(page).click();
			await expect.poll(() => google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
		});

		test(`/${locale}: the footer control brings the banner back`, async ({ page }) => {
			await watchGoogle(page);
			await open(page, `/${locale}`);
			await reject(page).click();
			await expect(banner(page)).toHaveCount(0);
			await expect(footerChange(page)).toHaveText(TEXT[locale].change);
			await footerChange(page).click();
			await expect(banner(page)).toBeVisible();
			expect(await stored(page)).toBeNull();
		});
	}

	test('after Accept the control reloads, asks again, clears _ga cookies and loads nothing', async ({
		page
	}) => {
		const google = await watchGoogle(page);
		await open(page, '/en');
		await accept(page).click();
		await expect.poll(() => google.filter((item) => item.startsWith(TAG_URL))).toEqual([TAG_URL]);
		await setCookies(page);

		google.length = 0;
		await footerChange(page).click();
		await expect(banner(page)).toBeVisible();
		await page.waitForLoadState('networkidle');
		expect(await stored(page)).toBeNull();
		expect(await cookieNames(page)).toEqual(['theme']);
		expect(google).toEqual([]);
		expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0);
	});

	test('the control is not in the HTML without JavaScript', async ({ request }) => {
		for (const url of ['/en', '/en/about']) {
			const html = await (await request.get(url)).text();
			expect(html, url).not.toContain('data-testid="consent-change"');
			expect(html, url).not.toContain('data-testid="consent-banner"');
		}
	});
});

test.describe('accessibility', () => {
	for (const url of ['/en', '/es', '/en/about', '/es/about']) {
		test(`${url} has no violations with the banner shown`, async ({ page }) => {
			await watchGoogle(page);
			await open(page, url);
			await expect(banner(page)).toBeVisible();
			await expectNoA11yViolations(page);
		});
	}

	for (const url of ['/en', '/es', '/en/about', '/es/about']) {
		for (const choice of ['accept', 'reject'] as const) {
			test(`${url} has no violations after ${choice}`, async ({ page }) => {
				await watchGoogle(page);
				await open(page, url);
				await (choice === 'accept' ? accept(page) : reject(page)).click();
				await expect(banner(page)).toHaveCount(0);
				await expect(footerChange(page)).toBeVisible();
				await expectNoA11yViolations(page);
			});
		}
	}
});

test.describe('JavaScript disabled', () => {
	test.use({ javaScriptEnabled: false });

	for (const url of ['/en', '/es', '/en/about', '/es/tools/f-uji']) {
		test(`${url} has no banner and sends no Google request`, async ({ page }) => {
			const google = await watchGoogle(page);
			await page.goto(url);
			await expect(page.locator('h1')).toBeVisible();
			await page.waitForLoadState('networkidle');
			await expect(banner(page)).toHaveCount(0);
			await expect(page.getByTestId('consent-change')).toHaveCount(0);
			expect(google).toEqual([]);
		});
	}
});
