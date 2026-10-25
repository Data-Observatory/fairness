import { getContent } from '$lib/core/content';
import { getLocale } from '$lib/paraglide/runtime';

// Fully static site: every route is prerendered at build time, no server runtime.
export const prerender = true;

export const load = () => {
	const { site } = getContent();
	return {
		site: {
			name: site.name[getLocale()],
			repository: site.repository,
			contributeUrl: site.contributeUrl
		}
	};
};
