import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		timeout: 120_000,
		reuseExistingServer: !process.env.CI
	},
	testMatch: '**/*.e2e.{ts,js}',
	use: {
		baseURL: 'http://localhost:4173',
		// The site disables CSS transitions under prefers-reduced-motion (layout.css) -
		// enabling it here avoids axe occasionally sampling colors mid-transition on a
		// freshly-active nav link (a real flake, not a real contrast violation).
		reducedMotion: 'reduce'
	},
	// Spec §10 explicitly calls out Safari (webkit) as the browser most likely to break
	// the print stylesheet; Firefox is the other target listed alongside Chrome.
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'] } },
		{ name: 'firefox', use: { ...devices['Desktop Firefox'] } },
		// WebKit needs system libraries that some dev machines (for example WSL) lack,
		// so it runs in CI or when PW_WEBKIT=1 is set.
		...(process.env.CI || process.env.PW_WEBKIT
			? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]
			: [])
	]
});
