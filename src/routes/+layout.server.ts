import { getContent } from '$lib/core/content';
import { buildHomeView } from '$lib/core/view';
import { getLocale } from '$lib/paraglide/runtime';

// Fully static site: every route is prerendered at build time, no server runtime.
export const prerender = true;

// Server load functions, not universal ones: a universal load would ship the content pipeline
// (YAML parser, schema validation) to the browser.
export const load = () => {
	const content = getContent();
	const { site } = content;
	const { shortName } = buildHomeView(content, getLocale(), new Date(__BUILD_DATE__));
	return {
		site: {
			name: site.name[getLocale()],
			shortName,
			domain: site.domain,
			repository: site.repository,
			contributeUrl: site.contributeUrl
		},
		features: { wizard: site.features.wizard }
	};
};
