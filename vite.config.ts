import { readdirSync } from 'node:fs';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { buildUrlPatterns } from './src/lib/url-patterns.ts';

// One prerender entry per tool file (files starting with an underscore are templates).
const toolIds = readdirSync('content/tools')
	.filter((name) => name.endsWith('.yaml') && !name.startsWith('_'))
	.map((name) => name.slice(0, -'.yaml'.length))
	.sort();

// Deploy target/base path is not fixed at dev/test time (a static host, possibly at a
// sub-path): always driven by an env var, never hardcoded.
const base = (process.env.BASE_PATH ?? '') as '' | `/${string}`;

export default defineConfig({
	// Baked in once at build time (not `new Date()` inside app code, which would re-run
	// on client hydration and drift from the prerendered server output).
	define: {
		__BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10))
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// BUILD_DIR lets scripts/check-base-path.mjs build into a temporary directory.
			adapter: adapter({ pages: process.env.BUILD_DIR ?? 'build' }),
			prerender: {
				// Explicit, not crawl-dependent: every locale's every page must exist in
				// the static build, not just whatever a link-crawler happens to discover.
				// SvelteKit prepends `paths.base` to each entry itself.
				entries: [
					'*',
					'/en',
					'/es',
					'/en/about',
					'/es/about',
					...toolIds.flatMap((id): `/${string}`[] => [`/en/tools/${id}`, `/es/tools/${id}`])
				]
			},
			paths: {
				base,

				// Absolute (base-rooted) links, not page-relative ones: relative output like
				// `../section/B` breaks if the host ever serves both `/section/A` and
				// `/section/A/` (a common static-hosting index-document behavior).
				relative: false
			}
		}),

		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			emitTsDeclarations: true,
			// No 'cookie': nothing runs server-side at runtime (fully static site), so
			// there's nothing to persist a locale preference in. Every locale is prefixed,
			// including the base one (en): see the urlPatterns override below.
			strategy: ['url', 'baseLocale'],
			urlPatterns: buildUrlPatterns(base)
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
