import { localizeHref } from '$lib/paraglide/runtime';
import type { ResolvedPathname } from '$app/types';

/**
 * Localizes an already-`resolve()`d internal path for the current (or given) locale.
 * Typed to return `ResolvedPathname` (not just `string`) so
 * `svelte/no-navigation-without-resolve` recognizes it as a legitimate internal link -
 * that rule checks the expression's *type*, not whether it's textually `resolve(...)`.
 */
export function localized(
	path: ResolvedPathname,
	options?: Parameters<typeof localizeHref>[1]
): ResolvedPathname {
	return localizeHref(path, options) as ResolvedPathname;
}
