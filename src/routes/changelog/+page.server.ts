import { getContent } from '$lib/core/content';
import { buildChangelogView } from '$lib/core/changelog';
import { getLocale } from '$lib/paraglide/runtime';

export const load = () => buildChangelogView(getContent(), getLocale());
