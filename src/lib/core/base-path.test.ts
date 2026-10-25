import '@inlang/paraglide-js/urlpattern-polyfill';
import { describe, expect, it } from 'vitest';
import { buildUrlPatterns } from '../url-patterns';

// `buildUrlPatterns(base)` returns the Paraglide `urlPatterns` option for a SvelteKit
// `paths.base` ('' or '/fair'). Paraglide receives full paths including the base (that is what
// `resolve()` and `reroute` see), so every pattern must carry the base. vite.config.ts uses the
// result for `paraglideVitePlugin({ urlPatterns })`, and for base '' it must equal the current
// hard-coded patterns. The helpers below follow Paraglide's matching: first matching pattern
// wins, named groups are carried over to the other side.

type Patterns = { pattern: string; localized: [string, string][] }[];
type Groups = Record<string, string | undefined>;

const groupsOf = (pattern: string, path: string): Groups | undefined => {
	const result = new URLPattern({ pathname: pattern }).exec({ pathname: path });
	return result?.pathname.groups as Groups | undefined;
};

const fill = (pattern: string, groups: Groups): string =>
	pattern.replace(/\/:(\w+)\(\.\*\)\?/g, (_all, name: string) =>
		groups[name] ? `/${groups[name]}` : ''
	) || '/';

function localize(patterns: Patterns, path: string, locale: string): string | undefined {
	for (const entry of patterns) {
		const groups = groupsOf(entry.pattern, path);
		const target = entry.localized.find(([name]) => name === locale);
		if (groups && target) return fill(target[1], groups);
	}
	return undefined;
}

function deLocalize(patterns: Patterns, path: string): string | undefined {
	for (const entry of patterns) {
		for (const [, localized] of entry.localized) {
			const groups = groupsOf(localized, path);
			if (groups) return fill(entry.pattern, groups);
		}
	}
	return undefined;
}

describe('buildUrlPatterns: base ""', () => {
	const patterns = buildUrlPatterns('') as Patterns;

	it('equals the current hard-coded patterns', () => {
		expect(patterns).toEqual([
			{
				pattern: '/',
				localized: [
					['en', '/en'],
					['es', '/es']
				]
			},
			{
				pattern: '/:path(.*)?',
				localized: [
					['en', '/en/:path(.*)?'],
					['es', '/es/:path(.*)?']
				]
			}
		]);
	});

	it('localizes the root and a tool page', () => {
		expect(localize(patterns, '/', 'en')).toBe('/en');
		expect(localize(patterns, '/', 'es')).toBe('/es');
		expect(localize(patterns, '/tools/f-uji', 'es')).toBe('/es/tools/f-uji');
		expect(localize(patterns, '/about', 'en')).toBe('/en/about');
	});

	it('de-localizes /en and /es/tools/f-uji', () => {
		expect(deLocalize(patterns, '/en')).toBe('/');
		expect(deLocalize(patterns, '/es/tools/f-uji')).toBe('/tools/f-uji');
	});
});

describe('buildUrlPatterns: base "/fair"', () => {
	const patterns = buildUrlPatterns('/fair') as Patterns;

	it('puts the base in front of every pattern and every localized pattern', () => {
		expect(patterns.length).toBeGreaterThan(0);
		for (const entry of patterns) {
			expect(entry.pattern.startsWith('/fair')).toBe(true);
			expect(entry.localized.map(([name]) => name).sort()).toEqual(['en', 'es']);
			for (const [name, localized] of entry.localized) {
				expect(localized.startsWith(`/fair/${name}`), localized).toBe(true);
			}
		}
	});

	it('localizes /fair and /fair/about', () => {
		expect(localize(patterns, '/fair', 'en')).toBe('/fair/en');
		expect(localize(patterns, '/fair/about', 'es')).toBe('/fair/es/about');
		expect(localize(patterns, '/fair/tools/f-uji', 'en')).toBe('/fair/en/tools/f-uji');
	});

	it('de-localizes /fair/en and /fair/es/about', () => {
		expect(deLocalize(patterns, '/fair/en')).toBe('/fair');
		expect(deLocalize(patterns, '/fair/es/about')).toBe('/fair/about');
	});

	it('does not touch paths outside the base', () => {
		expect(deLocalize(patterns, '/en')).toBeUndefined();
		expect(deLocalize(patterns, '/es/tools/f-uji')).toBeUndefined();
	});
});
