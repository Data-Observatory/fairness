import { describe, expect, it } from 'vitest';
import { buildHeadLinks } from './seo.ts';

// `buildHeadLinks` is pure: it receives the site domain (from content/site.yaml), the locales, and
// the de-localized pathname of the current page (the part after the locale prefix, optionally
// still carrying the build base path), and returns the canonical URL plus the hreflang alternates.
// Assumption under test: the production site lives at the root of its domain, so the canonical
// URL never contains the build base path (BASE_PATH only exists for sub-path test builds).

const base = {
	domain: 'fair.example.test',
	locales: ['en', 'es'],
	defaultLocale: 'en'
};

describe('buildHeadLinks canonical', () => {
	it('uses https, the domain, the locale and the path', () => {
		const result = buildHeadLinks({ ...base, locale: 'es', pathname: '/about' });
		expect(result.canonical).toBe('https://fair.example.test/es/about');
	});

	it('maps the home page to /<locale> without a trailing slash', () => {
		expect(buildHeadLinks({ ...base, locale: 'en', pathname: '/' }).canonical).toBe(
			'https://fair.example.test/en'
		);
		expect(buildHeadLinks({ ...base, locale: 'es', pathname: '' }).canonical).toBe(
			'https://fair.example.test/es'
		);
	});

	it('keeps nested paths and drops a trailing slash', () => {
		expect(buildHeadLinks({ ...base, locale: 'en', pathname: '/tools/f-uji/' }).canonical).toBe(
			'https://fair.example.test/en/tools/f-uji'
		);
	});

	it('strips the build base path from the canonical URL', () => {
		const result = buildHeadLinks({
			...base,
			basePath: '/fair',
			locale: 'en',
			pathname: '/fair/tools/f-uji'
		});
		expect(result.canonical).toBe('https://fair.example.test/en/tools/f-uji');
		expect(
			buildHeadLinks({ ...base, basePath: '/fair', locale: 'es', pathname: '/fair' }).canonical
		).toBe('https://fair.example.test/es');
	});

	it('does not strip a path that merely starts with the base text', () => {
		const result = buildHeadLinks({
			...base,
			basePath: '/fair',
			locale: 'en',
			pathname: '/fairness'
		});
		expect(result.canonical).toBe('https://fair.example.test/en/fairness');
	});
});

describe('buildHeadLinks alternates', () => {
	it('lists every locale plus x-default pointing to the default locale', () => {
		const result = buildHeadLinks({ ...base, locale: 'es', pathname: '/tools/f-uji' });
		expect(result.alternates).toEqual([
			{ hreflang: 'en', href: 'https://fair.example.test/en/tools/f-uji' },
			{ hreflang: 'es', href: 'https://fair.example.test/es/tools/f-uji' },
			{ hreflang: 'x-default', href: 'https://fair.example.test/en/tools/f-uji' }
		]);
	});

	it('is the same set of alternates whichever locale the page is in', () => {
		const en = buildHeadLinks({ ...base, locale: 'en', pathname: '/about' });
		const es = buildHeadLinks({ ...base, locale: 'es', pathname: '/about' });
		expect(en.alternates).toEqual(es.alternates);
	});

	it('uses the home path for the home page', () => {
		const result = buildHeadLinks({ ...base, locale: 'en', pathname: '/' });
		expect(result.alternates.map((a) => a.href)).toEqual([
			'https://fair.example.test/en',
			'https://fair.example.test/es',
			'https://fair.example.test/en'
		]);
	});

	it('points x-default to the configured default locale', () => {
		const result = buildHeadLinks({
			...base,
			defaultLocale: 'es',
			locale: 'en',
			pathname: '/about'
		});
		expect(result.alternates.at(-1)).toEqual({
			hreflang: 'x-default',
			href: 'https://fair.example.test/es/about'
		});
	});
});
