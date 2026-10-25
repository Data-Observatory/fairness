/**
 * The Paraglide `urlPatterns` option for a SvelteKit `paths.base` (`''` or e.g. `'/fair'`).
 *
 * Paraglide receives full paths including the base (that is what `resolve()` and `reroute`
 * see), so every pattern, on both sides, carries the base. Every locale is prefixed, including
 * the base one: `/` becomes `<base>/en` or `<base>/es`, and `/about` becomes `<base>/en/about`.
 * No import from Paraglide or SvelteKit here, so vite.config.ts and unit tests can use it.
 */
export const URL_PATTERN_LOCALES = ['en', 'es'] as const;

export type UrlPattern = {
	pattern: string;
	localized: [locale: string, pattern: string][];
};

export function buildUrlPatterns(base: string): UrlPattern[] {
	const prefix = base.replace(/\/+$/, '');
	return [
		{
			pattern: prefix === '' ? '/' : prefix,
			localized: URL_PATTERN_LOCALES.map((locale) => [locale, `${prefix}/${locale}`])
		},
		{
			pattern: `${prefix}/:path(.*)?`,
			localized: URL_PATTERN_LOCALES.map((locale) => [locale, `${prefix}/${locale}/:path(.*)?`])
		}
	];
}
