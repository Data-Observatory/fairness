import { getContent } from '$lib/core/content';
import { buildToolView } from '$lib/core/view';
import { getLocale } from '$lib/paraglide/runtime';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => getContent().tools.map((tool) => ({ id: tool.id }));

export const load: PageLoad = ({ params }) => ({
	tool: buildToolView(getContent(), params.id, getLocale(), new Date(__BUILD_DATE__))
});
