import { expect, type Page } from '@playwright/test';
import { test } from './base';
import { expectNoA11yViolations, expectRealPage } from './helpers';

// Owner decision 2026-11-03 (replaces D7 of 2026-11-02): the audience is in South America, so the
// Google tag loads by default and a notice tells the visitor, who can turn analytics off at any
// time. The two buttons have equal weight, the notice is shown again after 365 days and the choice
// can be changed from the footer and from the About page. Google hosts are stubbed so test runs
// send no hits to Google; the requests are still observed.

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

const DISABLE_FLAG = 'ga-disable-G-X6BJF4NQ71';

const TEXT = {
	en: { keep: 'Keep analytics on', disable: 'Turn off analytics', change: 'Analytics settings' },
	es: {
		keep: 'Mantener la analítica',
		disable: 'Desactivar la analítica',
		change: 'Ajustes de analítica'
	}
} as const;

const banner = (page: Page) => page.getByTestId('consent-banner');
const keepOn = (page: Page) => page.getByTestId('consent-keep');
const turnOff = (page: Page) => page.getByTestId('consent-disable');
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

const tagRequests = (google: string[]) =>
	google.filter((item) => item.startsWith('https://www.googletagmanager.com/gtag/js'));
const disableFlag = (page: Page) =>
	page.evaluate((name) => (window as unknown as Record<string, unknown>)[name], DISABLE_FLAG);

test.describe('first visit', () => {
	for (const url of PAGES) {
		test(`${url} shows the notice and loads the tag once, without a stored choice`, async ({
			page
		}) => {
			const google = await watchGoogle(page);
			await open(page, url);
			await expect(banner(page)).toBeVisible();
			await expect(keepOn(page)).toBeVisible();
			await expect(turnOff(page)).toBeVisible();
			await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
			expect(await disableFlag(page)).not.toBe(true);
			expect(await stored(page)).toBeNull();
		});
	}

	for (const locale of ['en', 'es'] as const) {
		test(`/${locale} notice buttons have the expected names`, async ({ page }) => {
			await open(page, `/${locale}`);
			await expect(banner(page).getByRole('button', { name: TEXT[locale].keep })).toBeVisible();
			await expect(banner(page).getByRole('button', { name: TEXT[locale].disable })).toBeVisible();
		});
	}

	test('the notice names Google Analytics and says it can be turned off', async ({ page }) => {
		await open(page, '/en');
		await expect(banner(page)).toContainText('Google Analytics');
		await expect(banner(page)).toContainText('turn it off');
		await open(page, '/es');
		await expect(banner(page)).toContainText('Google Analytics');
		await expect(banner(page)).toContainText('desactivarla');
	});

	test('the two buttons have the same size and style', async ({ page }) => {
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		const style = (button: ReturnType<typeof keepOn>) =>
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
		expect(await style(turnOff(page))).toEqual(await style(keepOn(page)));
	});

	test('the notice is in the normal flow, right after the skip link, and is not fixed', async ({
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

	test('the page does not scroll sideways at 375 px with the notice shown', async ({ page }) => {
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

	test('configures the tag with the exact host as cookie domain', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/en');
		const config = await page.evaluate(() =>
			(window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer
				.map((entry) => Array.from(entry))
				.find((entry) => entry[0] === 'config')
		);
		expect(config).toEqual(['config', 'G-X6BJF4NQ71', { cookie_domain: 'localhost' }]);
	});
});

test.describe('Turn off analytics', () => {
	for (const url of PAGES) {
		test(`${url} stores the choice, disables the tag and keeps Google silent after a reload`, async ({
			page
		}) => {
			const google = await watchGoogle(page);
			await open(page, url);
			await turnOff(page).click();
			await expect(banner(page)).toHaveCount(0);
			expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ v: 1, choice: 'denied' });
			expect(await disableFlag(page)).toBe(true);

			google.length = 0;
			await page.reload();
			await expect(footerChange(page)).toBeVisible();
			await page.waitForLoadState('networkidle');
			await expect(banner(page)).toHaveCount(0);
			expect(google).toEqual([]);
			expect(await page.locator('script[src*="googletagmanager"]').count()).toBe(0);
			expect(await disableFlag(page)).toBe(true);
		});
	}

	test('deletes _ga cookies and keeps other cookies', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/en');
		await setCookies(page);
		await turnOff(page).click();
		await expect(banner(page)).toHaveCount(0);
		expect(await cookieNames(page)).toEqual(['theme']);
	});
});

test.describe('Keep analytics on', () => {
	for (const url of ['/en', '/es', '/en/about', '/es/tools/f-uji', '/en/wizard']) {
		test(`${url} stores the choice and loads gtag.js once, also after a reload`, async ({
			page
		}) => {
			const google = await watchGoogle(page);
			await open(page, url);
			await keepOn(page).click();
			await expect(banner(page)).toHaveCount(0);
			expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ v: 1, choice: 'granted' });
			await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
			expect(await page.evaluate(() => typeof (window as { gtag?: unknown }).gtag)).toBe(
				'function'
			);

			google.length = 0;
			await page.reload();
			await expect(footerChange(page)).toBeVisible();
			await page.waitForLoadState('networkidle');
			await expect(banner(page)).toHaveCount(0);
			expect(tagRequests(google)).toEqual([TAG_URL]);
		});
	}

	test('navigating inside the site does not load the tag again', async ({ page }) => {
		const google = await watchGoogle(page);
		await open(page, '/en');
		await keepOn(page).click();
		await expect.poll(() => google.length).toBeGreaterThan(0);
		await page.getByRole('link', { name: 'About', exact: true }).first().click();
		await expect(page).toHaveURL(/\/en\/about\/?$/);
		await page.waitForLoadState('networkidle');
		expect(tagRequests(google)).toEqual([TAG_URL]);
		await expect(banner(page)).toHaveCount(0);
	});

	test('a choice made 364 days ago still applies', async ({ page }) => {
		const google = await watchGoogle(page);
		await seed(page, 'granted', 364);
		await page.goto('/en');
		await expect(footerChange(page)).toBeVisible();
		await expect(banner(page)).toHaveCount(0);
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
	});
});

test.describe('expired or unknown stored choices', () => {
	test('a denied choice older than 365 days shows the notice again and loads the tag', async ({
		page
	}) => {
		const google = await watchGoogle(page);
		await seed(page, 'denied', 366);
		await page.goto('/es');
		await expect(banner(page)).toBeVisible();
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
	});

	test('a granted choice older than 365 days shows the notice again and loads the tag', async ({
		page
	}) => {
		const google = await watchGoogle(page);
		await seed(page, 'granted', 366);
		await page.goto('/en');
		await expect(banner(page)).toBeVisible();
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
	});

	test('a stored value in another version shows the notice and loads the tag', async ({ page }) => {
		const google = await watchGoogle(page);
		await seed(page, 'denied', 1, 2);
		await page.goto('/en');
		await expect(banner(page)).toBeVisible();
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
	});

	test('a malformed stored value shows the notice and loads the tag', async ({ page }) => {
		const google = await watchGoogle(page);
		await page.addInitScript((key) => window.localStorage.setItem(key, 'denied'), KEY);
		await page.goto('/en');
		await expect(banner(page)).toBeVisible();
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
	});

	test('a denied choice made today keeps the notice away and Google silent', async ({ page }) => {
		const google = await watchGoogle(page);
		await seed(page, 'denied', 0);
		await page.goto('/en');
		await expect(footerChange(page)).toBeVisible();
		await expect(banner(page)).toHaveCount(0);
		await page.waitForLoadState('networkidle');
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

	test('the page works, the notice shows and the tag loads', async ({ page }) => {
		const google = await watchGoogle(page);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
		expect(errors).toEqual([]);
	});

	test('Turn off analytics hides the notice and disables the tag without an error', async ({
		page
	}) => {
		await watchGoogle(page);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await open(page, '/es/about');
		await turnOff(page).click();
		await expect(banner(page)).toHaveCount(0);
		expect(await disableFlag(page)).toBe(true);
		expect(errors).toEqual([]);
	});

	test('Keep analytics on hides the notice without an error', async ({ page }) => {
		const google = await watchGoogle(page);
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await open(page, '/en');
		await keepOn(page).click();
		await expect(banner(page)).toHaveCount(0);
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
		expect(errors).toEqual([]);
	});
});

test.describe('keyboard', () => {
	test('Tab reaches Keep and Turn off, in that order, after the skip link', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		await page.keyboard.press('Tab');
		await expect(page.locator(':focus')).toHaveAttribute('href', '#main-content');
		await page.keyboard.press('Tab');
		await expect(keepOn(page)).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(turnOff(page)).toBeFocused();
	});

	test('Enter on Turn off records the choice and moves focus to the main content', async ({
		page
	}) => {
		await watchGoogle(page);
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(turnOff(page)).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(banner(page)).toHaveCount(0);
		await expect(page.locator('main#main-content')).toBeFocused();
		expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ choice: 'denied' });
		expect(await disableFlag(page)).toBe(true);
	});

	test('Enter on Keep records the choice and moves focus to the main content', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/es');
		await expect(banner(page)).toBeVisible();
		await page.keyboard.press('Tab');
		await page.keyboard.press('Tab');
		await expect(keepOn(page)).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(banner(page)).toHaveCount(0);
		await expect(page.locator('main#main-content')).toBeFocused();
		expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ choice: 'granted' });
	});

	test('focus stays where it is when it was outside the notice', async ({ page }) => {
		await watchGoogle(page);
		await open(page, '/en');
		await expect(banner(page)).toBeVisible();
		const link = page.locator('header nav a').first();
		await link.focus();
		await expect(link).toBeFocused();
		await turnOff(page).dispatchEvent('click');
		await expect(banner(page)).toHaveCount(0);
		await expect(link).toBeFocused();
	});

	test('the notice does not take focus when the page loads', async ({ page }) => {
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
		test(`/${locale}/about: the control brings the notice back and keeps the stored choice`, async ({
			page
		}) => {
			const google = await watchGoogle(page);
			await open(page, `/${locale}/about`);
			await turnOff(page).click();
			await expect(banner(page)).toHaveCount(0);
			const control = page.locator('main').getByTestId('consent-change');
			await expect(control).toHaveText(TEXT[locale].change);
			await control.click();
			await expect(banner(page)).toBeVisible();
			expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ choice: 'denied' });
			// The tag was loaded at page load and only disabled, so Keep lifts the flag and needs no
			// second request in this page view; the next page view loads it again.
			await keepOn(page).click();
			await expect(banner(page)).toHaveCount(0);
			expect(JSON.parse((await stored(page)) ?? 'null')).toMatchObject({ choice: 'granted' });
			expect(await disableFlag(page)).toBe(false);
			expect(tagRequests(google)).toEqual([TAG_URL]);
			google.length = 0;
			await page.reload();
			await expect(footerChange(page)).toBeVisible();
			await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
		});

		test(`/${locale}: the footer control brings the notice back`, async ({ page }) => {
			await watchGoogle(page);
			await open(page, `/${locale}`);
			await turnOff(page).click();
			await expect(banner(page)).toHaveCount(0);
			await expect(footerChange(page)).toHaveText(TEXT[locale].change);
			await footerChange(page).click();
			await expect(banner(page)).toBeVisible();
			await expect(banner(page)).toBeFocused();
		});
	}

	test('after Keep the control shows the notice without a reload, then Turn off clears _ga cookies', async ({
		page
	}) => {
		const google = await watchGoogle(page);
		await open(page, '/en');
		await keepOn(page).click();
		await expect.poll(() => tagRequests(google)).toEqual([TAG_URL]);
		await setCookies(page);
		await page.evaluate(() => {
			(window as unknown as { marker: boolean }).marker = true;
		});

		await footerChange(page).click();
		await expect(banner(page)).toBeVisible();
		expect(await page.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(
			true
		);
		expect(await cookieNames(page)).toEqual(expect.arrayContaining(['_ga', 'theme']));

		await turnOff(page).click();
		await expect(banner(page)).toHaveCount(0);
		expect(await cookieNames(page)).toEqual(['theme']);
		expect(await disableFlag(page)).toBe(true);
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
		test(`${url} has no violations with the notice shown`, async ({ page }) => {
			await watchGoogle(page);
			await open(page, url);
			await expect(banner(page)).toBeVisible();
			await expectNoA11yViolations(page);
		});
	}

	for (const url of ['/en', '/es', '/en/about', '/es/about']) {
		for (const choice of ['keep', 'turn off'] as const) {
			test(`${url} has no violations after ${choice}`, async ({ page }) => {
				await watchGoogle(page);
				await open(page, url);
				await (choice === 'keep' ? keepOn(page) : turnOff(page)).click();
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
		test(`${url} has no notice, no change control and sends no Google request`, async ({
			page
		}) => {
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
