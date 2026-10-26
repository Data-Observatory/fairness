import { getContent } from '$lib/core/content';
import { buildHomeView } from '$lib/core/view';
import { getLocale } from '$lib/paraglide/runtime';

// The build date, not `new Date()`: the prerendered HTML and client hydration must agree.
export const load = () => {
	const content = getContent();
	return {
		view: buildHomeView(content, getLocale(), new Date(__BUILD_DATE__)),
		// The link to the guided finder follows the feature flag (the route itself stays prerendered).
		wizard: content.site.features.wizard
	};
};
