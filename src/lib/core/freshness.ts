import { isIsoDate } from './schema.ts';

const MS_PER_DAY = 86_400_000;

// Day numbers are computed in UTC from calendar fields only, so DST shifts cannot add or drop a day.
function utcDay(year: number, month: number, day: number): number {
	return Date.UTC(year, month, day) / MS_PER_DAY;
}

const pad = (value: number, width: number) => String(value).padStart(width, '0');

/** The LOCAL calendar date of `date` as YYYY-MM-DD (not the UTC date). */
export function localIsoDate(date: Date): string {
	return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/**
 * Whole calendar days between `iso` (YYYY-MM-DD) and the LOCAL calendar day of `today`.
 * Negative when `iso` lies in the future. Throws when `iso` is not an ISO date.
 */
export function daysSince(iso: string, today: Date): number {
	if (!isIsoDate(iso)) throw new Error(`Not an ISO date: ${iso}`);
	const [year, month, day] = iso.split('-').map(Number);
	return (
		utcDay(today.getFullYear(), today.getMonth(), today.getDate()) - utcDay(year, month - 1, day)
	);
}

/** True when the last verification is more than `staleAfterDays` days before `today`. */
export function isStale(
	verified: string | { last_verified: string },
	today: Date,
	staleAfterDays: number
): boolean {
	const iso = typeof verified === 'string' ? verified : verified.last_verified;
	return daysSince(iso, today) > staleAfterDays;
}
