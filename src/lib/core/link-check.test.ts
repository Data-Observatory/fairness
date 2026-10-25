import { describe, expect, it } from 'vitest';
import { getContent, loadContent, type Content } from './content';
import { daysSince, localIsoDate } from './freshness';
import {
	checkLinks,
	checkUrl,
	collectUrls,
	formatLinkReport,
	staleTools,
	type LinkResult
} from './link-check';
import { loadFixtureFiles, mutate } from './__fixtures__/helpers';

// No network: every request goes through an injected fake fetch. Dates are local calendar days
// (see freshness.ts), built with the Date constructor so the machine time zone does not matter.

const fixture = (edit?: (files: Record<string, string>) => Record<string, string>): Content =>
	loadContent(edit ? edit(loadFixtureFiles()) : loadFixtureFiles());

const TODAY = new Date(2026, 9, 25);
const USER_AGENT = 'fair-resources-finder-link-check/1.0 (test)';

const shift = (iso: string, days: number) => {
	const [year, month, date] = iso.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------------------------
// collectUrls

describe('collectUrls', () => {
	it('collects every url field of the fixture content, sorted by url', () => {
		const found = collectUrls(fixture());
		expect(found.map((item) => item.url)).toEqual(
			[
				'https://example.org/catalogue',
				'https://example.org/f-uji',
				'https://example.org/f-uji/api',
				'https://example.org/f-uji/source',
				'https://example.org/fair-enough',
				'https://example.org/metrics',
				'https://example.org/operator-a',
				'https://example.org/paper',
				'https://github.com/example-org/fairness',
				'https://github.com/example-org/fairness/blob/main/CONTRIBUTING.md'
			].sort()
		);
	});

	it('records the tool id and field of each tool usage', () => {
		const found = collectUrls(fixture());
		const usagesOf = (url: string) => found.find((item) => item.url === url)?.usages;
		expect(usagesOf('https://example.org/f-uji')).toEqual([{ toolId: 'f-uji', field: 'url' }]);
		expect(usagesOf('https://example.org/operator-a')).toEqual([
			{ toolId: 'f-uji', field: 'operator.url' }
		]);
		expect(usagesOf('https://example.org/f-uji/api')).toEqual([
			{ toolId: 'f-uji', field: 'api.url' }
		]);
		expect(usagesOf('https://example.org/f-uji/source')).toEqual([
			{ toolId: 'f-uji', field: 'source_code' }
		]);
		expect(usagesOf('https://example.org/paper')).toEqual([
			{ toolId: 'f-uji', field: 'references.0.url' }
		]);
		expect(usagesOf('https://example.org/catalogue')).toEqual([
			{ toolId: 'fair-catalogue', field: 'url' }
		]);
	});

	it('records site-level urls without a tool id', () => {
		const found = collectUrls(fixture());
		const repository = found.find((item) => item.url === 'https://github.com/example-org/fairness');
		const contribute = found.find((item) => item.url.endsWith('/CONTRIBUTING.md'));
		expect(repository?.usages).toEqual([{ field: 'repository' }]);
		expect(repository?.usages[0].toolId).toBeUndefined();
		expect(contribute?.usages).toEqual([{ field: 'contributeUrl' }]);
		expect(contribute?.usages[0].toolId).toBeUndefined();
	});

	it('numbers references by their index', () => {
		const content = fixture((files) =>
			mutate(files, 'content/tools/f-uji.yaml', (doc) => {
				doc.references = [
					{ title: 'First', url: 'https://example.org/ref-a' },
					{ title: 'Second', url: 'https://example.org/ref-b' }
				];
			})
		);
		const found = collectUrls(content);
		expect(found.find((item) => item.url === 'https://example.org/ref-a')?.usages).toEqual([
			{ toolId: 'f-uji', field: 'references.0.url' }
		]);
		expect(found.find((item) => item.url === 'https://example.org/ref-b')?.usages).toEqual([
			{ toolId: 'f-uji', field: 'references.1.url' }
		]);
	});

	it('omits optional fields that are absent', () => {
		const content = fixture((files) =>
			mutate(files, 'content/tools/f-uji.yaml', (doc) => {
				delete doc.api;
				delete doc.source_code;
				delete doc.references;
				delete doc.operator.url;
			})
		);
		const urls = collectUrls(content).map((item) => item.url);
		expect(urls).not.toContain('https://example.org/f-uji/api');
		expect(urls).not.toContain('https://example.org/f-uji/source');
		expect(urls).not.toContain('https://example.org/paper');
		expect(urls).not.toContain('https://example.org/operator-a');
		expect(urls).toContain('https://example.org/f-uji');
	});

	it('deduplicates by url and keeps every usage', () => {
		const content = fixture((files) =>
			mutate(files, 'content/tools/fair-enough.yaml', (doc) => {
				doc.url = 'https://example.org/f-uji';
			})
		);
		const found = collectUrls(content);
		const matches = found.filter((item) => item.url === 'https://example.org/f-uji');
		expect(matches).toHaveLength(1);
		const usages = [...matches[0].usages].sort((a, b) =>
			(a.toolId ?? '').localeCompare(b.toolId ?? '')
		);
		expect(usages).toEqual([
			{ toolId: 'f-uji', field: 'url' },
			{ toolId: 'fair-enough', field: 'url' }
		]);
		expect(new Set(found.map((item) => item.url)).size).toBe(found.length);
	});

	it('keeps two fields of the same tool that share a url', () => {
		const content = fixture((files) =>
			mutate(files, 'content/tools/f-uji.yaml', (doc) => {
				doc.operator.url = doc.url;
			})
		);
		const entry = collectUrls(content).find((item) => item.url === 'https://example.org/f-uji');
		const fields = (entry?.usages ?? []).map((usage) => usage.field).sort();
		expect(fields).toEqual(['operator.url', 'url']);
		expect(entry?.usages.every((usage) => usage.toolId === 'f-uji')).toBe(true);
	});

	it('merges a site-level and a tool-level usage of the same url', () => {
		const content = fixture((files) =>
			mutate(files, 'content/tools/fair-catalogue.yaml', (doc) => {
				doc.url = 'https://github.com/example-org/fairness';
			})
		);
		const entry = collectUrls(content).find(
			(item) => item.url === 'https://github.com/example-org/fairness'
		);
		expect(entry?.usages).toHaveLength(2);
		expect(entry?.usages).toContainEqual({ field: 'repository' });
		expect(entry?.usages).toContainEqual({ toolId: 'fair-catalogue', field: 'url' });
	});

	it('is sorted by url in plain string order', () => {
		const urls = collectUrls(fixture()).map((item) => item.url);
		expect(urls).toEqual([...urls].sort());
	});

	it('real content: every url starts with https:// and has at least one usage', () => {
		const found = collectUrls(getContent());
		expect(found.length).toBeGreaterThan(0);
		for (const item of found) {
			expect(item.url.startsWith('https://')).toBe(true);
			expect(item.usages.length).toBeGreaterThan(0);
		}
		const urls = found.map((item) => item.url);
		expect(new Set(urls).size).toBe(urls.length);
		expect(urls).toEqual([...urls].sort());
	});
});

// ---------------------------------------------------------------------------------------------
// checkUrl

type Call = { url: string; method: string; headers: Headers; signal?: AbortSignal | null };
type Handler = (call: Call, index: number) => Response | Promise<Response>;

function respond(status: number, extra: { url?: string; redirected?: boolean } = {}): Response {
	const response = new Response(null, { status });
	Object.defineProperty(response, 'url', { value: extra.url ?? '' });
	Object.defineProperty(response, 'redirected', { value: extra.redirected ?? false });
	return response;
}

function fakeFetch(handler: Handler) {
	const calls: Call[] = [];
	const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const call: Call = {
			url: String(input instanceof Request ? input.url : input),
			method: (init?.method ?? 'GET').toUpperCase(),
			headers: new Headers(init?.headers),
			signal: init?.signal
		};
		calls.push(call);
		return handler(call, calls.length - 1);
	}) as typeof fetch;
	return { fetch: fn, calls };
}

const options = (fetchFn: typeof fetch, extra: { retries?: number; timeoutMs?: number } = {}) => ({
	fetch: fetchFn,
	timeoutMs: extra.timeoutMs ?? 1000,
	retries: extra.retries ?? 0,
	userAgent: USER_AGENT
});

const URL_A = 'https://example.org/a';

describe('checkUrl: success and redirects', () => {
	it('a 200 on HEAD is ok after a single HEAD request', async () => {
		const { fetch, calls } = fakeFetch((call) => respond(200, { url: call.url }));
		const result = await checkUrl(URL_A, options(fetch));
		expect(result.url).toBe(URL_A);
		expect(result.status).toBe('ok');
		expect(calls.map((call) => call.method)).toEqual(['HEAD']);
		expect(calls[0].url).toBe(URL_A);
	});

	it('any 2xx is ok', async () => {
		const { fetch } = fakeFetch((call) => respond(204, { url: call.url }));
		expect((await checkUrl(URL_A, options(fetch))).status).toBe('ok');
	});

	it('a redirect inside the same host is ok', async () => {
		const { fetch } = fakeFetch(() =>
			respond(200, { url: 'https://example.org/b', redirected: true })
		);
		const result = await checkUrl(URL_A, options(fetch));
		expect(result.status).toBe('ok');
	});

	it('a redirect to a different host is redirect-other-host with the final url', async () => {
		const { fetch } = fakeFetch(() =>
			respond(200, { url: 'https://other.example.net/landing', redirected: true })
		);
		const result = await checkUrl(URL_A, options(fetch));
		expect(result.status).toBe('redirect-other-host');
		expect(result.finalUrl).toBe('https://other.example.net/landing');
		expect(result.httpStatus).toBe(200);
		expect(result.url).toBe(URL_A);
	});
});

describe('checkUrl: HEAD fallback to GET', () => {
	it.each([403, 405, 501])('falls back to GET when HEAD returns %i', async (status) => {
		const { fetch, calls } = fakeFetch((call) =>
			call.method === 'HEAD' ? respond(status, { url: call.url }) : respond(200, { url: call.url })
		);
		const result = await checkUrl(URL_A, options(fetch));
		expect(result.status).toBe('ok');
		expect(calls.map((call) => call.method)).toEqual(['HEAD', 'GET']);
	});

	it('falls back to GET when HEAD throws', async () => {
		const { fetch, calls } = fakeFetch((call) => {
			if (call.method === 'HEAD') throw new TypeError('fetch failed');
			return respond(200, { url: call.url });
		});
		const result = await checkUrl(URL_A, options(fetch));
		expect(result.status).toBe('ok');
		expect(calls.map((call) => call.method)).toEqual(['HEAD', 'GET']);
	});

	it('reports the GET result when HEAD and GET both return 403', async () => {
		const { fetch, calls } = fakeFetch((call) => respond(403, { url: call.url }));
		const result = await checkUrl(URL_A, options(fetch, { retries: 2 }));
		expect(result.status).toBe('client-error');
		expect(result.httpStatus).toBe(403);
		expect(calls.map((call) => call.method)).toEqual(['HEAD', 'GET']);
	});

	it('does not fall back to GET for 404 or 500', async () => {
		for (const status of [404, 410, 500]) {
			const { fetch, calls } = fakeFetch((call) => respond(status, { url: call.url }));
			await checkUrl(URL_A, options(fetch));
			expect(calls.every((call) => call.method === 'HEAD')).toBe(true);
		}
	});

	it('sends the same User-Agent on HEAD and on GET', async () => {
		const { fetch, calls } = fakeFetch((call) =>
			call.method === 'HEAD' ? respond(405, { url: call.url }) : respond(200, { url: call.url })
		);
		await checkUrl(URL_A, options(fetch));
		expect(calls).toHaveLength(2);
		for (const call of calls) expect(call.headers.get('user-agent')).toBe(USER_AGENT);
	});

	it('passes an AbortSignal to fetch', async () => {
		const { fetch, calls } = fakeFetch((call) => respond(200, { url: call.url }));
		await checkUrl(URL_A, options(fetch));
		expect(calls[0].signal).toBeInstanceOf(AbortSignal);
	});
});

describe('checkUrl: errors and retries', () => {
	it('4xx is client-error with its status and is never retried', async () => {
		const { fetch, calls } = fakeFetch((call) => respond(404, { url: call.url }));
		const result = await checkUrl(URL_A, options(fetch, { retries: 3 }));
		expect(result.status).toBe('client-error');
		expect(result.httpStatus).toBe(404);
		expect(calls).toHaveLength(1);
	});

	it('5xx is server-error after exactly retries + 1 requests', async () => {
		const { fetch, calls } = fakeFetch((call) => respond(503, { url: call.url }));
		const result = await checkUrl(URL_A, options(fetch, { retries: 2 }));
		expect(result.status).toBe('server-error');
		expect(result.httpStatus).toBe(503);
		expect(calls).toHaveLength(3);
	});

	it('5xx with retries 0 makes a single request', async () => {
		const { fetch, calls } = fakeFetch((call) => respond(500, { url: call.url }));
		const result = await checkUrl(URL_A, options(fetch, { retries: 0 }));
		expect(result.status).toBe('server-error');
		expect(calls).toHaveLength(1);
	});

	it('a retry that succeeds gives ok and stops retrying', async () => {
		const { fetch, calls } = fakeFetch((call, index) =>
			index === 0 ? respond(503, { url: call.url }) : respond(200, { url: call.url })
		);
		const result = await checkUrl(URL_A, options(fetch, { retries: 2 }));
		expect(result.status).toBe('ok');
		expect(calls).toHaveLength(2);
	});

	it('a network error on every request is network-error with a message', async () => {
		const { fetch, calls } = fakeFetch(() => {
			throw new TypeError('getaddrinfo ENOTFOUND example.org');
		});
		const result = await checkUrl(URL_A, options(fetch, { retries: 0 }));
		expect(result.status).toBe('network-error');
		expect(result.error).toContain('ENOTFOUND');
		expect(result.httpStatus).toBeUndefined();
		expect(calls.map((call) => call.method)).toEqual(['HEAD', 'GET']);
	});

	it('retries network errors', async () => {
		const { fetch, calls } = fakeFetch(() => {
			throw new TypeError('fetch failed');
		});
		const result = await checkUrl(URL_A, options(fetch, { retries: 2 }));
		expect(result.status).toBe('network-error');
		expect(calls.length).toBeGreaterThanOrEqual(3);
	});

	it('a network error followed by success is ok', async () => {
		let failures = 2;
		const { fetch } = fakeFetch((call) => {
			if (failures-- > 0) throw new TypeError('fetch failed');
			return respond(200, { url: call.url });
		});
		const result = await checkUrl(URL_A, options(fetch, { retries: 2 }));
		expect(result.status).toBe('ok');
	});

	it('a request that outlives timeoutMs is timeout', async () => {
		const { fetch } = fakeFetch(
			(call) =>
				new Promise<Response>((_resolve, reject) => {
					call.signal?.addEventListener('abort', () =>
						reject(
							call.signal?.reason ?? new DOMException('This operation was aborted', 'AbortError')
						)
					);
				})
		);
		const started = Date.now();
		const result = await checkUrl(URL_A, options(fetch, { timeoutMs: 30, retries: 0 }));
		expect(result.status).toBe('timeout');
		expect(result.httpStatus).toBeUndefined();
		expect(Date.now() - started).toBeLessThan(2000);
	});

	it('retries timeouts', async () => {
		const { fetch, calls } = fakeFetch(
			(call) =>
				new Promise<Response>((_resolve, reject) => {
					call.signal?.addEventListener('abort', () =>
						reject(
							call.signal?.reason ?? new DOMException('This operation was aborted', 'AbortError')
						)
					);
				})
		);
		const result = await checkUrl(URL_A, options(fetch, { timeoutMs: 20, retries: 1 }));
		expect(result.status).toBe('timeout');
		expect(calls.length).toBeGreaterThanOrEqual(2);
	});

	it('does not throw on any failure', async () => {
		const { fetch } = fakeFetch(() => {
			throw new Error('boom');
		});
		await expect(checkUrl(URL_A, options(fetch))).resolves.toMatchObject({
			url: URL_A,
			status: 'network-error'
		});
	});
});

// ---------------------------------------------------------------------------------------------
// checkLinks

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('checkLinks', () => {
	const urls = Array.from({ length: 12 }, (_, index) => `https://example.org/page-${index}`);

	function tracking() {
		const state = { inFlight: 0, max: 0, calls: 0 };
		const fn = (async (input: RequestInfo | URL) => {
			const url = String(input);
			state.calls += 1;
			state.inFlight += 1;
			state.max = Math.max(state.max, state.inFlight);
			// Earlier urls take longer, so completion order differs from input order.
			const index = Number(url.split('-').pop());
			await delay(5 + (urls.length - index) * 2);
			state.inFlight -= 1;
			return respond(200, { url });
		}) as typeof fetch;
		return { fn, state };
	}

	it('never exceeds the concurrency limit and uses all of it', async () => {
		const { fn, state } = tracking();
		const results = await checkLinks(urls, { ...options(fn), concurrency: 3 });
		expect(results).toHaveLength(urls.length);
		expect(state.max).toBeLessThanOrEqual(3);
		expect(state.max).toBe(3);
	});

	it('concurrency 1 runs one request at a time', async () => {
		const { fn, state } = tracking();
		await checkLinks(urls.slice(0, 4), { ...options(fn), concurrency: 1 });
		expect(state.max).toBe(1);
	});

	it('preserves the input order of the results', async () => {
		const { fn } = tracking();
		const results = await checkLinks(urls, { ...options(fn), concurrency: 4 });
		expect(results.map((result) => result.url)).toEqual(urls);
	});

	it('returns an empty list for no urls without calling fetch', async () => {
		const { fn, state } = tracking();
		expect(await checkLinks([], { ...options(fn), concurrency: 4 })).toEqual([]);
		expect(state.calls).toBe(0);
	});

	it('keeps going after a failing url and reports each result in place', async () => {
		const mixed = [
			'https://example.org/ok',
			'https://example.org/gone',
			'https://example.org/down'
		];
		const { fetch } = fakeFetch((call) => {
			if (call.url.endsWith('/gone')) return respond(404, { url: call.url });
			if (call.url.endsWith('/down')) throw new TypeError('fetch failed');
			return respond(200, { url: call.url });
		});
		const results = await checkLinks(mixed, { ...options(fetch), concurrency: 2 });
		expect(results.map((result) => [result.url, result.status])).toEqual([
			['https://example.org/ok', 'ok'],
			['https://example.org/gone', 'client-error'],
			['https://example.org/down', 'network-error']
		]);
	});
});

// ---------------------------------------------------------------------------------------------
// staleTools

describe('staleTools', () => {
	const withDates = (dates: Record<string, string>) =>
		fixture((files) => {
			let next = files;
			for (const [id, date] of Object.entries(dates)) {
				next = mutate(next, `content/tools/${id}.yaml`, (doc) => {
					doc.last_verified = date;
				});
			}
			return next;
		});

	it('lists tools not verified within staleAfterDays, oldest first', () => {
		const content = withDates({
			'f-uji': '2026-10-20',
			'fair-enough': '2026-01-01',
			'fair-catalogue': '2025-06-01',
			'fairsfair-metrics': '2025-01-15'
		});
		const stale = staleTools(content, TODAY);
		expect(stale.map((item) => item.id)).toEqual([
			'fairsfair-metrics',
			'fair-catalogue',
			'fair-enough'
		]);
		for (const item of stale) {
			expect(item.days).toBe(daysSince(item.lastVerified, TODAY));
		}
		expect(stale[0]).toEqual({
			id: 'fairsfair-metrics',
			lastVerified: '2025-01-15',
			days: daysSince('2025-01-15', TODAY)
		});
		const days = stale.map((item) => item.days);
		expect(days).toEqual([...days].sort((a, b) => b - a));
	});

	it('uses site.verification.staleAfterDays as the threshold: exactly N days is not stale', () => {
		const limit = fixture().site.verification.staleAfterDays;
		const today = localIsoDate(TODAY);
		const content = withDates({
			'f-uji': shift(today, limit),
			'fair-enough': shift(today, limit + 1),
			'fair-catalogue': today,
			'fairsfair-metrics': shift(today, limit - 1)
		});
		const stale = staleTools(content, TODAY);
		expect(stale).toEqual([
			{ id: 'fair-enough', lastVerified: shift(today, limit + 1), days: limit + 1 }
		]);
	});

	it('honours a different staleAfterDays from site.yaml', () => {
		const content = fixture((files) => {
			const edited = mutate(files, 'content/site.yaml', (doc) => {
				doc.verification.staleAfterDays = 30;
			});
			return mutate(edited, 'content/tools/f-uji.yaml', (doc) => {
				doc.last_verified = shift(localIsoDate(TODAY), 31);
			});
		});
		const stale = staleTools(content, TODAY);
		expect(stale.map((item) => item.id)).toContain('f-uji');
		expect(stale.find((item) => item.id === 'f-uji')?.days).toBe(31);
	});

	it('is empty when every tool was verified recently', () => {
		const recent = localIsoDate(TODAY);
		const content = withDates({
			'f-uji': recent,
			'fair-enough': recent,
			'fair-catalogue': recent,
			'fairsfair-metrics': recent
		});
		expect(staleTools(content, TODAY)).toEqual([]);
	});

	it('breaks ties on days by id', () => {
		const content = withDates({
			'f-uji': '2025-03-01',
			'fair-enough': '2025-03-01',
			'fair-catalogue': '2025-03-01',
			'fairsfair-metrics': '2025-03-01'
		});
		const ids = staleTools(content, TODAY).map((item) => item.id);
		expect(ids).toEqual([...ids].sort());
	});
});

// ---------------------------------------------------------------------------------------------
// formatLinkReport

const DISCLAIMER =
	'A 200 response does not confirm the tool works. Confirm by hand and update `last_verified`.';

// Built from escapes so this file holds no such character: en dash, em dash, symbols, dingbats,
// supplemental pictographs, variation selector.
const FORBIDDEN = new RegExp(
	'(?:[\\u2013\\u2014\\u2600-\\u27BF\\u{1F000}-\\u{1FAFF}]|\\uFE0F)',
	'u'
);

type Usage = { toolId?: string; field: string };

const result = (
	url: string,
	extra: Partial<LinkResult> & Pick<LinkResult, 'status'>
): LinkResult => ({
	url,
	...extra
});

const lineWith = (markdown: string, needle: string): string => {
	const lines = markdown.split('\n').filter((line) => line.includes(needle));
	expect(lines, `a line containing ${needle}`).toHaveLength(1);
	return lines[0];
};

const URL_404 = 'https://example.org/gone';
const URL_500 = 'https://example.org/broken';
const URL_REDIRECT = 'https://example.org/moved';
const URL_TIMEOUT = 'https://example.org/slow';
const URL_DOWN = 'https://example.org/down';
const OK_URLS = Array.from({ length: 7 }, (_, index) => `https://example.org/fine-${index}`);

function problemInput() {
	const results: LinkResult[] = [
		...OK_URLS.map((url) => result(url, { status: 'ok', httpStatus: 200 })),
		result(URL_404, { status: 'client-error', httpStatus: 404 }),
		result(URL_500, { status: 'server-error', httpStatus: 503 }),
		result(URL_REDIRECT, {
			status: 'redirect-other-host',
			httpStatus: 200,
			finalUrl: 'https://elsewhere.example.net/new'
		}),
		result(URL_TIMEOUT, { status: 'timeout', error: 'The operation timed out' }),
		result(URL_DOWN, { status: 'network-error', error: 'getaddrinfo ENOTFOUND example.org' })
	];
	const usages = new Map<string, Usage[]>([
		[URL_404, [{ toolId: 'f-uji', field: 'url' }]],
		[
			URL_500,
			[
				{ toolId: 'fair-enough', field: 'api.url' },
				{ toolId: 'f-uji', field: 'references.0.url' }
			]
		],
		[URL_REDIRECT, [{ toolId: 'fair-catalogue', field: 'source_code' }]],
		[URL_TIMEOUT, [{ field: 'repository' }]],
		[URL_DOWN, [{ toolId: 'fair-checker', field: 'operator.url' }]]
	]);
	const stale = [
		{ id: 'fairsfair-metrics', lastVerified: '2025-01-15', days: 648 },
		{ id: 'fair-enough', lastVerified: '2026-01-01', days: 297 }
	];
	return { results, usages, stale, today: TODAY, staleAfterDays: 180 };
}

describe('formatLinkReport', () => {
	it('starts with a title line that contains the ISO date', () => {
		const { markdown } = formatLinkReport(problemInput());
		const first = markdown.split('\n')[0];
		expect(first).toMatch(/^#\s+\S/);
		expect(first).toContain('2026-10-25');
	});

	it('uses the local calendar date of today for the title', () => {
		const { markdown } = formatLinkReport({
			...problemInput(),
			today: new Date(2026, 0, 5, 23, 59)
		});
		expect(markdown.split('\n')[0]).toContain('2026-01-05');
	});

	it('includes the exact confirmation sentence', () => {
		const { markdown } = formatLinkReport(problemInput());
		expect(markdown).toContain(DISCLAIMER);
	});

	it('hasFindings is true when links have problems', () => {
		expect(formatLinkReport(problemInput()).hasFindings).toBe(true);
	});

	it('lists each problem link on one line with status, http status, tool ids and fields', () => {
		const { markdown } = formatLinkReport(problemInput());

		const notFound = lineWith(markdown, URL_404);
		expect(notFound).toContain('client-error');
		expect(notFound).toContain('404');
		expect(notFound).toContain('f-uji');
		expect(notFound).toContain('url');

		const serverError = lineWith(markdown, URL_500);
		expect(serverError).toContain('server-error');
		expect(serverError).toContain('503');
		expect(serverError).toContain('fair-enough');
		expect(serverError).toContain('api.url');
		expect(serverError).toContain('f-uji');
		expect(serverError).toContain('references.0.url');

		const redirect = lineWith(markdown, URL_REDIRECT);
		expect(redirect).toContain('redirect-other-host');
		expect(redirect).toContain('https://elsewhere.example.net/new');
		expect(redirect).toContain('fair-catalogue');
		expect(redirect).toContain('source_code');

		const timeout = lineWith(markdown, URL_TIMEOUT);
		expect(timeout).toContain('timeout');
		expect(timeout).toContain('repository');

		const down = lineWith(markdown, URL_DOWN);
		expect(down).toContain('network-error');
		expect(down).toContain('fair-checker');
		expect(down).toContain('operator.url');
	});

	it('does not list ok links individually but counts them', () => {
		const { markdown } = formatLinkReport(problemInput());
		for (const url of OK_URLS) expect(markdown).not.toContain(url);
		const counted = markdown.split('\n').filter((line) => /\b7\b/.test(line) && /ok/i.test(line));
		expect(counted.length).toBeGreaterThan(0);
	});

	it('lists stale tools with their days and the threshold', () => {
		const { markdown } = formatLinkReport(problemInput());
		const metrics = lineWith(markdown, 'fairsfair-metrics');
		const enough = markdown.split('\n').filter((line) => line.includes('fair-enough'));
		expect(metrics).toContain('648');
		expect(enough.some((line) => line.includes('297'))).toBe(true);
		expect(markdown).toContain('180');
	});

	it('orders stale tools by days descending as given and problem links by url', () => {
		const { markdown } = formatLinkReport(problemInput());
		const lines = markdown.split('\n');
		const at = (needle: string) => lines.findIndex((line) => line.includes(needle));
		// Problem links in url order: broken, down, gone, moved, slow.
		const order = [URL_500, URL_DOWN, URL_404, URL_REDIRECT, URL_TIMEOUT].map(at);
		expect(order.every((index) => index >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		const staleOrder = lines.findIndex(
			(line) => line.includes('fairsfair-metrics') && line.includes('648')
		);
		const staleNext = lines.findIndex(
			(line) => line.includes('fair-enough') && line.includes('297')
		);
		expect(staleOrder).toBeGreaterThanOrEqual(0);
		expect(staleNext).toBeGreaterThan(staleOrder);
	});

	it('is deterministic: input order of results and usages does not change the output', () => {
		const input = problemInput();
		const first = formatLinkReport(input).markdown;
		const shuffledUsages = new Map(
			[...input.usages.entries()].reverse().map(([url, list]) => [url, [...list].reverse()])
		);
		const second = formatLinkReport({
			...input,
			results: [...input.results].reverse(),
			usages: shuffledUsages
		}).markdown;
		expect(second).toBe(first);
		expect(formatLinkReport(input).markdown).toBe(first);
	});

	it('accepts usages as a plain record as well as a Map', () => {
		const input = problemInput();
		const fromMap = formatLinkReport(input).markdown;
		const fromRecord = formatLinkReport({
			...input,
			usages: Object.fromEntries(input.usages)
		}).markdown;
		expect(fromRecord).toBe(fromMap);
	});

	it('handles a problem link that has no recorded usage', () => {
		const input = problemInput();
		input.usages.delete(URL_404);
		const { markdown } = formatLinkReport(input);
		expect(lineWith(markdown, URL_404)).toContain('client-error');
	});

	it('reports stale tools alone as findings', () => {
		const input = problemInput();
		const { markdown, hasFindings } = formatLinkReport({
			...input,
			results: OK_URLS.map((url) => result(url, { status: 'ok', httpStatus: 200 }))
		});
		expect(hasFindings).toBe(true);
		expect(markdown).toContain('fairsfair-metrics');
		expect(markdown).toContain(DISCLAIMER);
	});

	it('reports problem links alone as findings', () => {
		const input = problemInput();
		const { markdown, hasFindings } = formatLinkReport({ ...input, stale: [] });
		expect(hasFindings).toBe(true);
		expect(markdown).toContain(URL_404);
		expect(markdown).not.toContain('fairsfair-metrics');
	});

	it('says so in one line when there are no problems and no stale tools', () => {
		const { markdown, hasFindings } = formatLinkReport({
			results: OK_URLS.map((url) => result(url, { status: 'ok', httpStatus: 200 })),
			usages: new Map(),
			stale: [],
			today: TODAY,
			staleAfterDays: 180
		});
		expect(hasFindings).toBe(false);
		const statements = markdown
			.split('\n')
			.filter((line) => /\bno (findings|problems)\b/i.test(line));
		expect(statements).toHaveLength(1);
		expect(markdown.split('\n')[0]).toContain('2026-10-25');
		expect(markdown).toContain(DISCLAIMER);
		for (const url of OK_URLS) expect(markdown).not.toContain(url);
	});

	it('does not say "no findings" when there are findings', () => {
		const { markdown } = formatLinkReport(problemInput());
		expect(markdown).not.toMatch(/\bno (findings|problems)\b/i);
	});

	it('handles an empty run (no links, no stale tools)', () => {
		const { markdown, hasFindings } = formatLinkReport({
			results: [],
			usages: new Map(),
			stale: [],
			today: TODAY,
			staleAfterDays: 180
		});
		expect(hasFindings).toBe(false);
		expect(markdown.split('\n')[0]).toContain('2026-10-25');
	});

	it('contains no em dash, en dash or emoji', () => {
		const { markdown } = formatLinkReport(problemInput());
		expect(markdown).not.toMatch(FORBIDDEN);
		const clean = formatLinkReport({
			results: [],
			usages: new Map(),
			stale: [],
			today: TODAY,
			staleAfterDays: 180
		});
		expect(clean.markdown).not.toMatch(FORBIDDEN);
	});

	it('removes dashes and emoji that arrive inside error messages', () => {
		const em = String.fromCharCode(0x2014);
		const en = String.fromCharCode(0x2013);
		const input = problemInput();
		input.results.push(
			result('https://example.org/odd', {
				status: 'network-error',
				error: `connect failed ${em} retry ${en} later ${String.fromCodePoint(0x1f4a5)}`
			})
		);
		const { markdown } = formatLinkReport(input);
		expect(markdown).toContain('https://example.org/odd');
		expect(markdown).not.toMatch(FORBIDDEN);
	});

	it('the FORBIDDEN pattern really matches the characters it guards against', () => {
		expect(FORBIDDEN.test(String.fromCharCode(0x2014))).toBe(true);
		expect(FORBIDDEN.test(String.fromCharCode(0x2013))).toBe(true);
		expect(FORBIDDEN.test(String.fromCodePoint(0x1f600))).toBe(true);
		expect(FORBIDDEN.test(String.fromCharCode(0x2705))).toBe(true);
		expect(FORBIDDEN.test('plain - hyphen, colon: ok')).toBe(false);
	});
});
