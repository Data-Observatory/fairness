import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { daysSince, isStale } from './freshness';

// Calendar days are local (decision 4): `day` builds local midnight, so these tests do not
// depend on the time zone of the machine. `shift` does pure calendar arithmetic on the string.
const day = (iso: string) => {
	const [year, month, date] = iso.split('-').map(Number);
	return new Date(year, month - 1, date);
};
const shift = (iso: string, days: number) => {
	const [year, month, date] = iso.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10);
};

describe('daysSince', () => {
	it('is 0 on the same day', () => {
		expect(daysSince('2026-10-25', day('2026-10-25'))).toBe(0);
	});

	it('counts whole calendar days', () => {
		expect(daysSince('2026-10-24', day('2026-10-25'))).toBe(1);
		expect(daysSince('2026-10-15', day('2026-10-25'))).toBe(10);
	});

	it('ignores the time of day of today', () => {
		expect(daysSince('2026-10-25', new Date(2026, 9, 25, 23, 59, 59))).toBe(0);
		expect(daysSince('2026-10-24', new Date(2026, 9, 25, 0, 0, 1))).toBe(1);
	});

	it('crosses month, year and leap day boundaries', () => {
		expect(daysSince('2026-12-31', day('2027-01-01'))).toBe(1);
		expect(daysSince('2024-02-28', day('2024-03-01'))).toBe(2);
		expect(daysSince('2025-02-28', day('2025-03-01'))).toBe(1);
		expect(daysSince('2025-10-25', day('2026-10-25'))).toBe(365);
	});

	it('is negative for a date in the future', () => {
		expect(daysSince('2026-10-26', day('2026-10-25'))).toBe(-1);
	});

	it('throws on a string that is not an ISO date', () => {
		expect(() => daysSince('not-a-date', day('2026-10-25'))).toThrow();
	});
});

describe.each(['Pacific/Auckland', 'America/Los_Angeles', 'UTC'])(
	'local calendar date of today (TZ=%s)',
	(zone) => {
		const previous = process.env.TZ;
		beforeEach(() => {
			process.env.TZ = zone;
		});
		afterEach(() => {
			if (previous === undefined) delete process.env.TZ;
			else process.env.TZ = previous;
		});

		it('uses the local date, not the UTC date, early in the local day', () => {
			const today = new Date(2026, 9, 26, 1, 0);
			expect(daysSince('2026-10-26', today)).toBe(0);
			expect(daysSince('2026-10-25', today)).toBe(1);
			expect(daysSince('2026-10-27', today)).toBe(-1);
		});

		it('uses the local date, not the UTC date, late in the local day', () => {
			const today = new Date(2026, 9, 25, 23, 0);
			expect(daysSince('2026-10-25', today)).toBe(0);
			expect(daysSince('2026-10-26', today)).toBe(-1);
			expect(daysSince('2026-10-24', today)).toBe(1);
		});

		it('isStale boundary is unchanged: exactly staleAfterDays is not stale', () => {
			const today = new Date(2026, 9, 26, 1, 0);
			expect(isStale(shift('2026-10-26', 180), today, 180)).toBe(false);
			expect(isStale(shift('2026-10-26', 181), today, 180)).toBe(true);
			const late = new Date(2026, 9, 25, 23, 0);
			expect(isStale(shift('2026-10-25', 180), late, 180)).toBe(false);
			expect(isStale(shift('2026-10-25', 181), late, 180)).toBe(true);
		});
	}
);

describe('isStale', () => {
	const today = day('2026-10-25');

	it('exactly staleAfterDays old is not stale', () => {
		expect(isStale(shift('2026-10-25', 180), today, 180)).toBe(false);
	});

	it('one day more than staleAfterDays is stale', () => {
		expect(isStale(shift('2026-10-25', 181), today, 180)).toBe(true);
	});

	it('one day less than staleAfterDays is not stale', () => {
		expect(isStale(shift('2026-10-25', 179), today, 180)).toBe(false);
	});

	it('verified today is not stale', () => {
		expect(isStale('2026-10-25', today, 180)).toBe(false);
	});

	it('a future date is not stale', () => {
		expect(isStale('2026-11-25', today, 180)).toBe(false);
	});

	it('follows the threshold it is given', () => {
		expect(isStale(shift('2026-10-25', 30), today, 30)).toBe(false);
		expect(isStale(shift('2026-10-25', 31), today, 30)).toBe(true);
		expect(isStale(shift('2026-10-25', 31), today, 365)).toBe(false);
	});

	it('a threshold of 0 makes anything older than today stale', () => {
		expect(isStale('2026-10-25', today, 0)).toBe(false);
		expect(isStale('2026-10-24', today, 0)).toBe(true);
	});
});
