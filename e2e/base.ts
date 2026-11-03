import { test as base } from '@playwright/test';

// Analytics load by default (owner decision 2026-11-03), so every page in every test would request
// the Google tag. This fixture answers those requests locally in all tests, so a test run sends no
// hit to Google. A test that observes the requests registers its own route, which takes precedence.
const GOOGLE_HOST =
	/^(www|region\d+)?\.?(googletagmanager|google-analytics|analytics\.google)\.com$/;

export const test = base.extend<{ stubGoogle: void }>({
	stubGoogle: [
		async ({ context }, use) => {
			await context.route(
				(target) => GOOGLE_HOST.test(target.hostname),
				(route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' })
			);
			await use();
		},
		{ auto: true }
	]
});
