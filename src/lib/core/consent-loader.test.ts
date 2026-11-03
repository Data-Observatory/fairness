import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, parseConsent, serializeConsent } from './consent';
import { localIsoDate } from './freshness';

// static/consent-loader.js is plain JavaScript that runs before the app. It is the only code that
// can load the Google tag. Analytics are on by default (owner decision 2026-11-03): the tag loads
// unless the visitor stored a current "denied" choice. It cannot import consent.ts, so these tests
// keep the two in step.

const FILE = join(process.cwd(), 'static', 'consent-loader.js');
const source = readFileSync(FILE, 'utf8');
const TAG_ID = 'G-X6BJF4NQ71';
const DISABLE_FLAG = `ga-disable-${'G-X6BJF4NQ71'}`;
const TAG_URL = `https://www.googletagmanager.com/gtag/js?id=${TAG_ID}`;
const DENIED = {
	analytics_storage: 'denied',
	ad_storage: 'denied',
	ad_user_data: 'denied',
	ad_personalization: 'denied'
};
const GRANTED = {
	analytics_storage: 'granted',
	ad_storage: 'denied',
	ad_user_data: 'denied',
	ad_personalization: 'denied'
};

const daysAgo = (days: number) => {
	const now = new Date();
	return localIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
};
const storedValue = (choice: string, date: string, version = 1) =>
	JSON.stringify({ v: version, choice, date });

type Options = {
	stored?: string | null;
	storageThrows?: boolean;
	hostname?: string;
	cookies?: string[];
};

function run({
	stored = null,
	storageThrows = false,
	hostname = 'localhost',
	cookies = []
}: Options) {
	const data = new Map<string, string>();
	if (stored !== null) data.set(CONSENT_STORAGE_KEY, stored);
	const appended: { tag: string; src?: string; async?: boolean }[] = [];
	const classes: string[] = [];
	const cookieWrites: string[] = [];
	const localStorage = {
		getItem: (key: string) => {
			if (storageThrows) throw new DOMException('blocked', 'SecurityError');
			return data.get(key) ?? null;
		},
		setItem: (key: string, value: string) => {
			if (storageThrows) throw new DOMException('blocked', 'SecurityError');
			data.set(key, value);
		},
		removeItem: (key: string) => {
			if (storageThrows) throw new DOMException('blocked', 'SecurityError');
			data.delete(key);
		}
	};
	const window: Record<string, unknown> = { location: { hostname } };
	// The getter is installed like a browser does it: reading it may throw.
	Object.defineProperty(window, 'localStorage', {
		get: () => {
			if (storageThrows) throw new DOMException('blocked', 'SecurityError');
			return localStorage;
		}
	});
	const document = {
		documentElement: { classList: { add: (name: string) => classes.push(name) } },
		head: { appendChild: (element: { tag: string; src?: string }) => appended.push(element) },
		createElement: (tag: string) => ({ tag }),
		get cookie() {
			return cookies.map((name) => `${name}=1`).join('; ');
		},
		set cookie(value: string) {
			cookieWrites.push(value);
		}
	};
	runInNewContext(source, { window, document });
	const dataLayer = (window.dataLayer as ArrayLike<unknown>[]).map((entry) =>
		Array.from(entry as ArrayLike<unknown>)
	);
	return {
		window,
		data,
		appended,
		classes,
		cookieWrites,
		dataLayer,
		layer: () =>
			(window.dataLayer as ArrayLike<unknown>[]).map((entry) =>
				Array.from(entry as ArrayLike<unknown>)
			),
		consent: window.fairConsent as {
			grant(): void;
			deny(): void;
			isLoaded(): boolean;
		}
	};
}

describe('consent-loader.js: agreement with consent.ts', () => {
	it('uses the storage key of consent.ts', () => {
		const match = /STORAGE_KEY\s*=\s*'([^']+)'/.exec(source);
		expect(match?.[1]).toBe(CONSENT_STORAGE_KEY);
	});

	it('uses the stored format version of consent.ts', () => {
		const match = /\bVERSION\s*=\s*(\d+)\s*;/.exec(source);
		expect(Number(match?.[1])).toBe(CONSENT_VERSION);
	});

	it('writes values that consent.ts reads back', () => {
		const loader = run({});
		loader.consent.grant();
		expect(parseConsent(loader.data.get(CONSENT_STORAGE_KEY))).toBe('granted');
		const today = new Date();
		expect(loader.data.get(CONSENT_STORAGE_KEY)).toBe(serializeConsent('granted', today));
		loader.consent.deny();
		expect(parseConsent(loader.data.get(CONSENT_STORAGE_KEY))).toBe('denied');
	});

	it('names the configured tag id and has no inline-script or module syntax', () => {
		expect(source).toContain(TAG_ID);
		expect(source).not.toMatch(/^\s*(import|export)\s/m);
	});

	it('does not use em or en dashes', () => {
		expect(source).not.toMatch(
			new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
		);
	});
});

describe('consent-loader.js: first paint', () => {
	it('adds the class js to the root element', () => {
		expect(run({}).classes).toEqual(['js']);
		expect(run({ storageThrows: true }).classes).toEqual(['js']);
	});
});

describe('consent-loader.js: before a choice', () => {
	it('loads the tag with analytics storage granted and everything else denied', () => {
		const loader = run({});
		expect(loader.appended).toEqual([{ tag: 'script', async: true, src: TAG_URL }]);
		expect(loader.layer().map((entry) => entry[0])).toEqual(['consent', 'js', 'config']);
		expect(loader.layer()[0]).toEqual(['consent', 'default', GRANTED]);
		expect(loader.layer()[2]).toEqual(['config', TAG_ID, { cookie_domain: 'localhost' }]);
		expect(typeof loader.window.gtag).toBe('function');
		expect(loader.consent.isLoaded()).toBe(true);
		expect(loader.window[DISABLE_FLAG]).not.toBe(true);
	});

	it.each([
		['an unknown choice', storedValue('maybe', daysAgo(1))],
		['another version', storedValue('denied', daysAgo(1), 2)],
		['malformed JSON', '{"v":1,"choice":"den'],
		['a plain word', 'denied'],
		['a denied choice older than 365 days', storedValue('denied', daysAgo(366))],
		['a denied choice with an impossible date', storedValue('denied', '2026-02-30')]
	])('loads the tag for %s', (_label, stored) => {
		const loader = run({ stored });
		expect(loader.appended).toEqual([{ tag: 'script', async: true, src: TAG_URL }]);
		expect(loader.dataLayer[0]).toEqual(['consent', 'default', GRANTED]);
	});

	it('loads the tag and does not throw when storage throws', () => {
		const loader = run({ storageThrows: true });
		expect(loader.appended).toEqual([{ tag: 'script', async: true, src: TAG_URL }]);
		expect(loader.dataLayer[0]).toEqual(['consent', 'default', GRANTED]);
	});
});

describe('consent-loader.js: after a stored granted choice', () => {
	it.each([daysAgo(0), daysAgo(365)])('loads the tag once (choice dated %s)', (date) => {
		const loader = run({ stored: storedValue('granted', date) });
		expect(loader.appended).toEqual([{ tag: 'script', async: true, src: TAG_URL }]);
		expect(loader.layer().map((entry) => entry[0])).toEqual(['consent', 'js', 'config']);
		expect(loader.layer()[0]).toEqual(['consent', 'default', GRANTED]);
		expect(loader.consent.isLoaded()).toBe(true);
	});
});

describe('consent-loader.js: after a stored denied choice', () => {
	it.each([daysAgo(0), daysAgo(365)])(
		'loads nothing, denies every consent type and disables the tag (choice dated %s)',
		(date) => {
			const loader = run({ stored: storedValue('denied', date) });
			expect(loader.appended).toEqual([]);
			expect(loader.dataLayer).toEqual([['consent', 'default', DENIED]]);
			expect(loader.window[DISABLE_FLAG]).toBe(true);
			expect(loader.consent.isLoaded()).toBe(false);
		}
	);
});

describe('consent-loader.js: window.fairConsent', () => {
	it('has no revoke: changing the choice only asks again', () => {
		expect(run({}).consent).not.toHaveProperty('revoke');
	});

	it('grant stores the choice and does not load the tag a second time', () => {
		const loader = run({});
		loader.consent.grant();
		loader.consent.grant();
		expect(loader.appended).toEqual([{ tag: 'script', async: true, src: TAG_URL }]);
		expect(loader.layer().filter((entry) => entry[0] === 'config')).toEqual([
			['config', TAG_ID, { cookie_domain: 'localhost' }]
		]);
		expect(parseConsent(loader.data.get(CONSENT_STORAGE_KEY))).toBe('granted');
	});

	it('grant after a stored denied choice loads the tag and lifts the disable flag', () => {
		const loader = run({ stored: storedValue('denied', daysAgo(1)) });
		loader.consent.grant();
		expect(loader.appended).toEqual([{ tag: 'script', async: true, src: TAG_URL }]);
		expect(loader.window[DISABLE_FLAG]).toBe(false);
		expect(loader.layer().find((entry) => entry[0] === 'consent' && entry[1] === 'update')).toEqual(
			['consent', 'update', GRANTED]
		);
		expect(parseConsent(loader.data.get(CONSENT_STORAGE_KEY))).toBe('granted');
	});

	it('grant does not throw when storage throws', () => {
		const loader = run({ storageThrows: true });
		expect(() => loader.consent.grant()).not.toThrow();
		expect(loader.appended).toHaveLength(1);
	});

	it('deny stores the choice, sets the disable flag and sets consent to denied', () => {
		const loader = run({});
		loader.consent.deny();
		expect(parseConsent(loader.data.get(CONSENT_STORAGE_KEY))).toBe('denied');
		expect(loader.window[DISABLE_FLAG]).toBe(true);
		expect(loader.layer().at(-1)).toEqual(['consent', 'update', DENIED]);
	});

	it('deny does not throw when storage throws and still disables the tag', () => {
		const loader = run({ storageThrows: true });
		expect(() => loader.consent.deny()).not.toThrow();
		expect(loader.window[DISABLE_FLAG]).toBe(true);
	});

	it('scopes the tag cookies to the exact host, not the parent domain', () => {
		const loader = run({ hostname: 'fair.dataobservatory.net' });
		expect(loader.layer().find((entry) => entry[0] === 'config')).toEqual([
			'config',
			TAG_ID,
			{ cookie_domain: 'fair.dataobservatory.net' }
		]);
	});

	describe('cookie deletion on deny', () => {
		const expiry = /expires=Thu, 01 Jan 1970 00:00:00 GMT/;
		const domainOf = (write: string) => /domain=([^;]+)/.exec(write)?.[1] ?? '';
		const forName = (writes: string[], name: string) =>
			writes.filter((write) => write.startsWith(`${name}=;`) && expiry.test(write));

		it('deletes this property cookie on the host and on parent domains', () => {
			const loader = run({
				hostname: 'fair.dataobservatory.net',
				cookies: ['_ga_X6BJF4NQ71', 'theme']
			});
			loader.consent.deny();
			const domains = forName(loader.cookieWrites, '_ga_X6BJF4NQ71').map(domainOf);
			expect(domains).toEqual(
				expect.arrayContaining(['', 'fair.dataobservatory.net', 'dataobservatory.net'])
			);
			expect(loader.cookieWrites.some((write) => write.startsWith('theme='))).toBe(false);
			expect(loader.cookieWrites.some((write) => /domain=net(;|$)/.test(write))).toBe(false);
		});

		it.each(['_ga', '_gid', '_gat', '_gat_gtag_G_X6BJF4NQ71'])(
			'deletes %s only without a domain and on the exact host, never on a parent domain',
			(name) => {
				const loader = run({ hostname: 'fair.dataobservatory.net', cookies: [name] });
				loader.consent.deny();
				const domains = forName(loader.cookieWrites, name).map(domainOf);
				expect(domains.sort()).toEqual(['', 'fair.dataobservatory.net']);
			}
		);

		it('never writes another property cookie or a shared cookie on a parent domain', () => {
			const loader = run({
				hostname: 'fair.dataobservatory.net',
				cookies: ['_ga_ZCRKY3JWGH', '_ga', '_gid']
			});
			loader.consent.deny();
			const onParent = loader.cookieWrites.filter((write) => {
				const domain = domainOf(write);
				return domain !== '' && domain !== 'fair.dataobservatory.net';
			});
			expect(onParent).toEqual([]);
			expect(loader.cookieWrites.some((write) => write.startsWith('_ga_ZCRKY3JWGH='))).toBe(false);
		});
	});
});
