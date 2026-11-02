import { buildComparePage } from '$lib/core/compare';
import { getContent } from '$lib/core/content';
import { getLocale } from '$lib/paraglide/runtime';

// The build date, not `new Date()`: the prerendered HTML and client hydration must agree.
// With `features.compare: false` the page carries no data and says it is not available.
export const load = () => {
	const content = getContent();
	return {
		compare: content.site.features.compare
			? buildComparePage(content, getLocale(), new Date(__BUILD_DATE__))
			: undefined
	};
};
