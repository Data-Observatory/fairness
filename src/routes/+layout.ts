import { getContent } from '$lib/core/content';

// Fully static site: every route is prerendered at build time, no server runtime.
export const prerender = true;

export const load = () => {
	const { site } = getContent();
	return { site: { repository: site.repository, contributeUrl: site.contributeUrl } };
};
