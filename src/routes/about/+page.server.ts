import { getContent } from '$lib/core/content';
import { buildHomeView } from '$lib/core/view';
import { getLocale } from '$lib/paraglide/runtime';

// The build date, not `new Date()`: the prerendered HTML and client hydration must agree.
export const load = () => {
	const content = getContent();
	const locale = getLocale();
	return {
		caveats: buildHomeView(content, locale, new Date(__BUILD_DATE__)).caveats,
		statuses: content.taxonomy.status.map((value) => ({
			id: value.id,
			label: value.label[locale],
			description: value.description?.[locale]
		})),
		staleAfterDays: content.site.verification.staleAfterDays,
		siteUrl: `https://${content.site.domain}/`
	};
};
