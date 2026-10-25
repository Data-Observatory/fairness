/**
 * Canonical and alternate (hreflang) links for a page head. Pure: no Svelte, no Paraglide.
 *
 * Assumption: in production the site is served at the root of its domain
 * (`https://<domain>/<locale>/<path>`). The build base path (`BASE_PATH`, for example `/fair`)
 * only exists for sub-path test builds, so it is stripped from the pathname and never appears in
 * canonical or alternate URLs.
 */
export type HeadLinksInput = {
	/** Site domain from content/site.yaml, without scheme. */
	domain: string;
	locales: readonly string[];
	defaultLocale: string;
	/** Locale of the current page. */
	locale: string;
	/** Pathname without the locale prefix, optionally still carrying `basePath`. */
	pathname: string;
	/** Build base path: '' or a path such as '/fair'. */
	basePath?: string;
};

export type HeadLinks = {
	canonical: string;
	alternates: { hreflang: string; href: string }[];
};

/** Removes the base path (whole segments only) and any trailing slash; '' means the home page. */
function appPath(pathname: string, basePath: string): string {
	const prefix = basePath.replace(/\/+$/, '');
	let path = pathname;
	if (prefix !== '' && (path === prefix || path.startsWith(`${prefix}/`))) {
		path = path.slice(prefix.length);
	}
	return path.replace(/\/+$/, '');
}

export function buildHeadLinks(input: HeadLinksInput): HeadLinks {
	const path = appPath(input.pathname, input.basePath ?? '');
	const url = (locale: string) => `https://${input.domain}/${locale}${path}`;
	return {
		canonical: url(input.locale),
		alternates: [
			...input.locales.map((locale) => ({ hreflang: locale, href: url(locale) })),
			{ hreflang: 'x-default', href: url(input.defaultLocale) }
		]
	};
}
