import { daysSince, localIsoDate } from './freshness.ts';
import { isIsoDate } from './iso-date.ts';

/** localStorage key that holds the visitor's analytics choice. */
export const CONSENT_STORAGE_KEY = 'fair-consent';

/** Version of the stored format. A stored value with another version counts as not stored. */
export const CONSENT_VERSION = 1;

export type ConsentChoice = 'granted' | 'denied';

export type StoredConsent = { version: number; choice: ConsentChoice; date: string };

/** The part of `Storage` that is used. A missing storage (null or undefined) is tolerated. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Stored form: `{"v":1,"choice":"granted","date":"YYYY-MM-DD"}` (local calendar date). */
export function serializeConsent(choice: ConsentChoice, date: Date): string {
	return JSON.stringify({ v: CONSENT_VERSION, choice, date: localIsoDate(date) });
}

/** Parses a stored value. Anything unknown or malformed gives null. */
export function parseStoredConsent(raw: string | null | undefined): StoredConsent | null {
	if (typeof raw !== 'string') return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
	const { v, choice, date } = value as Record<string, unknown>;
	if (v !== CONSENT_VERSION) return null;
	if (choice !== 'granted' && choice !== 'denied') return null;
	if (typeof date !== 'string' || !isIsoDate(date)) return null;
	return { version: CONSENT_VERSION, choice, date };
}

/** The choice in a stored value, or null when the value is unknown or malformed. */
export function parseConsent(raw: string | null | undefined): ConsentChoice | null {
	return parseStoredConsent(raw)?.choice ?? null;
}

/**
 * True when the visitor has to be asked: nothing stored, another stored version, or a choice
 * made more than `maxAgeDays` calendar days before `today`.
 */
export function needsPrompt(
	stored: StoredConsent | null,
	today: Date,
	maxAgeDays: number = 365
): boolean {
	if (stored === null || stored.version !== CONSENT_VERSION) return true;
	if (!isIsoDate(stored.date)) return true;
	return daysSince(stored.date, today) > maxAgeDays;
}

/** Reads the stored consent. Returns null when storage is missing, blocked or holds no valid value. */
export function readConsent(storage: StorageLike | null | undefined): StoredConsent | null {
	try {
		return parseStoredConsent(storage?.getItem(CONSENT_STORAGE_KEY));
	} catch {
		return null;
	}
}

/** Stores the choice. Does nothing when storage is missing or blocked. */
export function writeConsent(
	storage: StorageLike | null | undefined,
	choice: ConsentChoice,
	date: Date
): void {
	try {
		storage?.setItem(CONSENT_STORAGE_KEY, serializeConsent(choice, date));
	} catch {
		// Blocked or full storage: the choice then only lasts for the page view.
	}
}
