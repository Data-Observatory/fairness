import { describe, expect, it } from 'vitest';
import {
	allowedValuesOf,
	createOpenMemory,
	expandForPrint,
	matchingIds,
	urlWithQuery,
	withSearch
} from './home-state.ts';

const cards = [
	{ id: 'a', filterFields: { mode: ['manual'], target: ['dataset'] } },
	{ id: 'b', filterFields: { mode: ['automated'], target: [] } }
];

describe('matchingIds', () => {
	it('returns every id without a selection', () => {
		expect(matchingIds(cards, {})).toEqual(['a', 'b']);
	});
	it('applies OR within a group and AND across groups', () => {
		expect(matchingIds(cards, { mode: ['manual', 'automated'] })).toEqual(['a', 'b']);
		expect(matchingIds(cards, { mode: ['automated'], target: ['dataset'] })).toEqual([]);
	});
});

describe('allowedValuesOf', () => {
	it('lists option ids per group', () => {
		expect(
			allowedValuesOf([{ id: 'mode', options: [{ id: 'manual' }, { id: 'automated' }] }])
		).toEqual({
			mode: ['manual', 'automated']
		});
	});
});

describe('createOpenMemory', () => {
	it('opens while a filter is active and restores the previous state afterwards', () => {
		const closed = { open: false };
		const opened = { open: true };
		const applyClosed = createOpenMemory();
		const applyOpened = createOpenMemory();
		applyClosed(closed, false);
		expect(closed.open).toBe(false);
		applyClosed(closed, true);
		applyOpened(opened, true);
		expect(closed.open).toBe(true);
		applyClosed(closed, false);
		applyOpened(opened, false);
		expect(closed.open).toBe(false);
		expect(opened.open).toBe(true);
	});
});

describe('withSearch and urlWithQuery', () => {
	it('appends a query with or without the question mark', () => {
		expect(withSearch('/es', '?mode=manual')).toBe('/es?mode=manual');
		expect(withSearch('/es', 'mode=manual')).toBe('/es?mode=manual');
		expect(withSearch('/es', '')).toBe('/es');
	});
	it('replaces the query and keeps path and hash', () => {
		expect(urlWithQuery({ pathname: '/en', hash: '#x' }, 'mode=manual')).toBe('/en?mode=manual#x');
		expect(urlWithQuery({ pathname: '/en', hash: '' }, '')).toBe('/en');
	});
});

describe('expandForPrint', () => {
	it('opens everything and restores each element', () => {
		const items = [{ open: true }, { open: false }];
		const restore = expandForPrint(items);
		expect(items.map((i) => i.open)).toEqual([true, true]);
		restore();
		expect(items.map((i) => i.open)).toEqual([true, false]);
	});
});
