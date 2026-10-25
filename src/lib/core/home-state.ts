import { matchesSelection, type Selection } from './filter.ts';

/** The part of a card the home page needs to filter it. */
export type FilterableCard = { id: string; filterFields: Record<string, readonly string[]> };

/** Ids of the cards that match the selection, in the order given. */
export function matchingIds(cards: readonly FilterableCard[], selection: Selection): string[] {
	return cards
		.filter((card) => matchesSelection((group) => card.filterFields[group] ?? [], selection))
		.map((card) => card.id);
}

/** Allowed ids per filter group, taken from the options a page actually offers. */
export function allowedValuesOf(
	groups: readonly { id: string; options: readonly { id: string }[] }[]
): Record<string, string[]> {
	return Object.fromEntries(groups.map((group) => [group.id, group.options.map((o) => o.id)]));
}

/**
 * Keeps a collapsible section open while a filter is active, so a match is never inside a closed
 * section and a section without matches can show its empty message. The state before the filter
 * started is remembered and restored when it ends, so a section the visitor opened stays open and
 * the configured `collapsed` default applies again otherwise.
 */
export function createOpenMemory() {
	let before: boolean | undefined;
	return (element: { open: boolean }, filterActive: boolean): void => {
		if (filterActive) {
			before ??= element.open;
			element.open = true;
		} else if (before !== undefined) {
			element.open = before;
			before = undefined;
		}
	};
}

/** Appends a query string (with or without the leading "?") to a path, replacing none. */
export function withSearch(href: string, search: string): string {
	const query = search.replace(/^\?/, '');
	return query === '' ? href : `${href}?${query}`;
}

/** Same URL (path and hash) with the query replaced by `query` (without "?"). */
export function urlWithQuery(url: { pathname: string; hash: string }, query: string): string {
	return `${url.pathname}${query === '' ? '' : `?${query}`}${url.hash}`;
}

/**
 * Opens every element (details) and returns a function that restores each one to the state it
 * had before, so a section the visitor opened stays open after printing.
 */
export function expandForPrint(elements: Iterable<{ open: boolean }>): () => void {
	const remembered = [...elements].map((element) => ({ element, wasOpen: element.open }));
	for (const { element } of remembered) element.open = true;
	return () => {
		for (const { element, wasOpen } of remembered) element.open = wasOpen;
	};
}
