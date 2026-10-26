import { getContent } from '$lib/core/content';
import { buildWizardView } from '$lib/core/view';
import { getLocale } from '$lib/paraglide/runtime';

// The build date, not `new Date()`: the prerendered HTML and client hydration must agree.
export const load = () => ({
	view: buildWizardView(getContent(), getLocale(), new Date(__BUILD_DATE__))
});
