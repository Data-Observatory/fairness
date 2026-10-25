/**
 * The current query string, kept in step with the address bar. SvelteKit's `page.url` does not
 * follow `replaceState`, and the locale switch in the layout must follow the filter selection.
 */
export const currentQuery = $state({ search: '' });
