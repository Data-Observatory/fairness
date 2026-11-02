import { describe, expect, it } from 'vitest';
import {
	CONSENT_STORAGE_KEY,
	CONSENT_VERSION,
	clearConsent,
	needsPrompt,
	parseConsent,
	parseStoredConsent,
	readConsent,
	serializeConsent,
	writeConsent,
	type StoredConsent
} from './consent';

const TODAY = new Date(2026, 10, 2);

/** Local midnight `days` calendar days before TODAY. */
const daysAgo = (days: number) =>
	new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() - days);

const stored = (date: string, choice: 'granted' | 'denied' = 'granted'): StoredConsent => ({
	version: CONSENT_VERSION,
	choice,
	date
});

function memoryStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key: string) => data.get(key) ?? null,
		setItem: (key: string, value: string) => void data.set(key, value),
		removeItem: (key: string) => void data.delete(key)
	};
}

const throwing = (name: string) => ({
	getItem: () => {
		throw new DOMException('blocked', name);
	},
	setItem: () => {
		throw new DOMException('blocked', name);
	}
});

describe('constants', () => {
	it('uses the key fair-consent and version 1', () => {
		expect(CONSENT_STORAGE_KEY).toBe('fair-consent');
		expect(CONSENT_VERSION).toBe(1);
	});
});

describe('serializeConsent', () => {
	it('stores version, choice and the local calendar date', () => {
		expect(serializeConsent('granted', new Date(2026, 10, 2, 23, 59))).toBe(
			'{"v":1,"choice":"granted","date":"2026-11-02"}'
		);
		expect(serializeConsent('denied', new Date(2026, 0, 5))).toBe(
			'{"v":1,"choice":"denied","date":"2026-01-05"}'
		);
	});
});

describe('parseConsent', () => {
	it('reads the choice of a serialized value', () => {
		expect(parseConsent(serializeConsent('granted', TODAY))).toBe('granted');
		expect(parseConsent(serializeConsent('denied', TODAY))).toBe('denied');
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['empty string', ''],
		['not JSON', 'granted'],
		['a JSON string', '"granted"'],
		['a JSON array', '[]'],
		['JSON null', 'null'],
		['a number', '1'],
		['truncated JSON', '{"v":1,"choice":"gra'],
		['unknown choice', '{"v":1,"choice":"maybe","date":"2026-11-02"}'],
		['missing choice', '{"v":1,"date":"2026-11-02"}'],
		['missing version', '{"choice":"granted","date":"2026-11-02"}'],
		['another version', '{"v":2,"choice":"granted","date":"2026-11-02"}'],
		['version as string', '{"v":"1","choice":"granted","date":"2026-11-02"}'],
		['missing date', '{"v":1,"choice":"granted"}'],
		['malformed date', '{"v":1,"choice":"granted","date":"02/11/2026"}'],
		['impossible date', '{"v":1,"choice":"granted","date":"2026-02-30"}'],
		['date as number', '{"v":1,"choice":"granted","date":20261102}'],
		['choice with other case', '{"v":1,"choice":"Granted","date":"2026-11-02"}']
	])('returns null for %s', (_label, raw) => {
		expect(parseConsent(raw as string | null | undefined)).toBeNull();
		expect(parseStoredConsent(raw as string | null | undefined)).toBeNull();
	});

	it('ignores unknown extra fields', () => {
		expect(parseConsent('{"v":1,"choice":"denied","date":"2026-11-02","x":true}')).toBe('denied');
	});
});

describe('parseStoredConsent', () => {
	it('returns version, choice and date', () => {
		expect(parseStoredConsent('{"v":1,"choice":"denied","date":"2026-03-04"}')).toEqual({
			version: 1,
			choice: 'denied',
			date: '2026-03-04'
		});
	});
});

describe('needsPrompt', () => {
	it('asks when nothing is stored', () => {
		expect(needsPrompt(null, TODAY)).toBe(true);
	});

	it('does not ask for a choice made today', () => {
		expect(needsPrompt(stored('2026-11-02'), TODAY)).toBe(false);
		expect(needsPrompt(stored('2026-11-02', 'denied'), TODAY)).toBe(false);
	});

	it('does not ask up to 365 days after the choice and asks from day 366', () => {
		const iso = (date: Date) =>
			`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		expect(needsPrompt(stored(iso(daysAgo(365))), TODAY)).toBe(false);
		expect(needsPrompt(stored(iso(daysAgo(366))), TODAY)).toBe(true);
	});

	it('honours a custom maximum age', () => {
		expect(needsPrompt(stored('2026-10-03'), TODAY, 30)).toBe(false);
		expect(needsPrompt(stored('2026-10-02'), TODAY, 30)).toBe(true);
		expect(needsPrompt(stored('2026-11-02'), TODAY, 0)).toBe(false);
		expect(needsPrompt(stored('2026-11-01'), TODAY, 0)).toBe(true);
	});

	it('asks again when the stored version differs from the current one', () => {
		expect(needsPrompt({ ...stored('2026-11-02'), version: CONSENT_VERSION + 1 }, TODAY)).toBe(
			true
		);
	});
});

describe('readConsent', () => {
	it('returns the stored consent', () => {
		const storage = memoryStorage({ [CONSENT_STORAGE_KEY]: serializeConsent('granted', TODAY) });
		expect(readConsent(storage)).toEqual({ version: 1, choice: 'granted', date: '2026-11-02' });
	});

	it('returns null when nothing is stored or the value is malformed', () => {
		expect(readConsent(memoryStorage())).toBeNull();
		expect(readConsent(memoryStorage({ [CONSENT_STORAGE_KEY]: 'garbage' }))).toBeNull();
	});

	it('returns null when the storage is missing', () => {
		expect(readConsent(null)).toBeNull();
		expect(readConsent(undefined)).toBeNull();
	});

	it('returns null when reading throws (SecurityError and others)', () => {
		expect(readConsent(throwing('SecurityError'))).toBeNull();
		expect(
			readConsent({
				getItem: () => {
					throw new Error('boom');
				},
				setItem: () => {}
			})
		).toBeNull();
	});

	it('returns null when the storage has no getItem', () => {
		expect(readConsent({} as never)).toBeNull();
	});
});

describe('writeConsent', () => {
	it('stores the serialized choice under the consent key', () => {
		const storage = memoryStorage();
		writeConsent(storage, 'denied', TODAY);
		expect(storage.data.get(CONSENT_STORAGE_KEY)).toBe(serializeConsent('denied', TODAY));
		expect(readConsent(storage)?.choice).toBe('denied');
	});

	it('replaces an earlier choice', () => {
		const storage = memoryStorage();
		writeConsent(storage, 'denied', TODAY);
		writeConsent(storage, 'granted', TODAY);
		expect(readConsent(storage)?.choice).toBe('granted');
	});

	it('does nothing and does not throw when the storage is missing', () => {
		expect(() => writeConsent(null, 'granted', TODAY)).not.toThrow();
		expect(() => writeConsent(undefined, 'granted', TODAY)).not.toThrow();
	});

	it('does not throw when writing fails (SecurityError, quota)', () => {
		expect(() => writeConsent(throwing('SecurityError'), 'granted', TODAY)).not.toThrow();
		expect(() => writeConsent(throwing('QuotaExceededError'), 'denied', TODAY)).not.toThrow();
	});
});

describe('clearConsent', () => {
	it('removes the stored choice, so the visitor is asked again', () => {
		const storage = memoryStorage({ [CONSENT_STORAGE_KEY]: serializeConsent('granted', TODAY) });
		clearConsent(storage);
		expect(storage.data.has(CONSENT_STORAGE_KEY)).toBe(false);
		expect(needsPrompt(readConsent(storage), TODAY)).toBe(true);
	});

	it('leaves other keys alone', () => {
		const storage = memoryStorage({ other: 'x', [CONSENT_STORAGE_KEY]: 'garbage' });
		clearConsent(storage);
		expect(storage.data.get('other')).toBe('x');
	});

	it('does nothing and does not throw when the storage is missing or blocked', () => {
		expect(() => clearConsent(null)).not.toThrow();
		expect(() => clearConsent(undefined)).not.toThrow();
		expect(() =>
			clearConsent({
				removeItem: () => {
					throw new DOMException('blocked', 'SecurityError');
				}
			})
		).not.toThrow();
		expect(() => clearConsent({} as never)).not.toThrow();
	});
});
