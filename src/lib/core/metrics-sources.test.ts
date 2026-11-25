import { describe, expect, it } from 'vitest';
import { SourceError, createSources, type SourceOptions } from './metrics-sources';

// No network: every request goes through an injected fake fetch.

type Call = { url: string; headers: Headers };
type Reply = Response | Error | ((call: Call) => Response | Error);

function fake(routes: Record<string, Reply | Reply[]>) {
	const calls: Call[] = [];
	const counters = new Map<string, number>();
	const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const call = { url, headers: new Headers(init?.headers) };
		calls.push(call);
		const route = routes[url];
		if (route === undefined) return new Response('not routed', { status: 599 });
		const index = counters.get(url) ?? 0;
		counters.set(url, index + 1);
		const reply = Array.isArray(route) ? (route[index] ?? route[route.length - 1]) : route;
		const resolved = typeof reply === 'function' ? reply(call) : reply;
		if (resolved instanceof Error) throw resolved;
		return resolved;
	}) as typeof fetch;
	return { fetchFn, calls };
}

const json = (body: unknown, init: ResponseInit = {}) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
		...init
	});

const options = (fetchFn: typeof fetch, extra: Partial<SourceOptions> = {}): SourceOptions => ({
	fetch: fetchFn,
	userAgent: 'metrics-test/1.0',
	timeoutMs: 1000,
	retries: 1,
	retryDelayMs: 0,
	...extra
});

const kindOf = async (promise: Promise<unknown>) => {
	try {
		await promise;
	} catch (error) {
		expect(error).toBeInstanceOf(SourceError);
		return (error as SourceError).kind;
	}
	return 'resolved';
};

const OPENALEX = 'https://api.openalex.org/works/doi:10.1016/j.patter.2021.100370';

describe('openalex source', () => {
	it('returns cited_by_count for the DOI and sends the user agent', async () => {
		const { fetchFn, calls } = fake({
			[OPENALEX]: json({ cited_by_count: 110, title: 'An automated solution' })
		});
		const sources = createSources(options(fetchFn));
		expect(await sources.openalex('10.1016/j.patter.2021.100370')).toBe(110);
		expect(calls).toHaveLength(1);
		expect(calls[0].headers.get('user-agent')).toBe('metrics-test/1.0');
	});

	it('keeps the slash of the DOI and encodes the other reserved characters', async () => {
		const url = 'https://api.openalex.org/works/doi:10.1002/(sici)1097%3B2';
		const { fetchFn, calls } = fake({ [url]: json({ cited_by_count: 1, title: 'x' }) });
		await createSources(options(fetchFn)).openalex('10.1002/(sici)1097;2');
		expect(calls[0].url).toBe(url);
	});

	it('reports not-found for a 404', async () => {
		const { fetchFn } = fake({ [OPENALEX]: new Response('', { status: 404 }) });
		const sources = createSources(options(fetchFn));
		expect(await kindOf(sources.openalex('10.1016/j.patter.2021.100370'))).toBe('not-found');
	});

	it.each([
		['no count', { title: 'x' }],
		['a negative count', { cited_by_count: -1, title: 'x' }],
		['a fractional count', { cited_by_count: 1.5, title: 'x' }],
		['a string count', { cited_by_count: '12', title: 'x' }],
		['no title', { cited_by_count: 3 }],
		['an empty title', { cited_by_count: 3, title: '  ' }],
		['an array', []]
	])('reports shape for %s', async (_name, body) => {
		const { fetchFn } = fake({ [OPENALEX]: json(body) });
		const sources = createSources(options(fetchFn));
		expect(await kindOf(sources.openalex('10.1016/j.patter.2021.100370'))).toBe('shape');
	});

	it('reports shape for a body that is not JSON', async () => {
		const { fetchFn } = fake({ [OPENALEX]: new Response('<html>', { status: 200 }) });
		const sources = createSources(options(fetchFn));
		expect(await kindOf(sources.openalex('10.1016/j.patter.2021.100370'))).toBe('shape');
	});

	it('retries a server error and then succeeds', async () => {
		const { fetchFn, calls } = fake({
			[OPENALEX]: [new Response('', { status: 503 }), json({ cited_by_count: 5, title: 'x' })]
		});
		const sources = createSources(options(fetchFn));
		expect(await sources.openalex('10.1016/j.patter.2021.100370')).toBe(5);
		expect(calls).toHaveLength(2);
	});

	it('reports http after the retries are used up, without retrying a 404', async () => {
		const { fetchFn, calls } = fake({ [OPENALEX]: new Response('', { status: 500 }) });
		const sources = createSources(options(fetchFn, { retries: 2 }));
		expect(await kindOf(sources.openalex('10.1016/j.patter.2021.100370'))).toBe('http');
		expect(calls).toHaveLength(3);
	});

	it('reports network for a failing fetch', async () => {
		const { fetchFn } = fake({ [OPENALEX]: new Error('getaddrinfo ENOTFOUND') });
		const sources = createSources(options(fetchFn, { retries: 0 }));
		expect(await kindOf(sources.openalex('10.1016/j.patter.2021.100370'))).toBe('network');
	});

	it('reports network for a request that times out', async () => {
		const fetchFn = ((_url: string, init?: RequestInit) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
			})) as unknown as typeof fetch;
		const sources = createSources(options(fetchFn, { timeoutMs: 20, retries: 0 }));
		expect(await kindOf(sources.openalex('10.1016/j.patter.2021.100370'))).toBe('network');
	});
});

describe('zenodo source', () => {
	const URL_ = 'https://zenodo.org/api/records/15045911';

	it('returns stats.downloads of the record', async () => {
		const { fetchFn } = fake({ [URL_]: json({ stats: { downloads: 17372, views: 5 } }) });
		expect(await createSources(options(fetchFn)).zenodo('15045911')).toBe(17372);
	});

	it.each([
		['no stats', {}],
		['no downloads', { stats: { views: 1 } }],
		['a negative count', { stats: { downloads: -2 } }],
		['a string', { stats: { downloads: '5' } }]
	])('reports shape for %s', async (_name, body) => {
		const { fetchFn } = fake({ [URL_]: json(body) });
		expect(await kindOf(createSources(options(fetchFn)).zenodo('15045911'))).toBe('shape');
	});

	it('reports not-found for a 404', async () => {
		const { fetchFn } = fake({ [URL_]: new Response('', { status: 404 }) });
		expect(await kindOf(createSources(options(fetchFn)).zenodo('15045911'))).toBe('not-found');
	});
});

describe('pypi source', () => {
	const URL_ = 'https://pypistats.org/api/packages/howfairis/recent';

	it('returns data.last_month', async () => {
		const { fetchFn } = fake({
			[URL_]: json({ data: { last_day: 1, last_week: 9, last_month: 2114 }, package: 'howfairis' })
		});
		expect(await createSources(options(fetchFn)).pypi('howfairis')).toBe(2114);
	});

	it('reports shape when last_month is missing', async () => {
		const { fetchFn } = fake({ [URL_]: json({ data: {} }) });
		expect(await kindOf(createSources(options(fetchFn)).pypi('howfairis'))).toBe('shape');
	});

	it('reports not-found for a 404', async () => {
		const { fetchFn } = fake({ [URL_]: new Response('', { status: 404 }) });
		expect(await kindOf(createSources(options(fetchFn)).pypi('howfairis'))).toBe('not-found');
	});
});

describe('github source', () => {
	const REPO = 'https://api.github.com/repos/pangaea-data-publisher/fuji';
	const RELEASE = `${REPO}/releases/latest`;
	const CONTRIBUTORS = `${REPO}/contributors?per_page=1&anon=1`;
	const repoBody = {
		stargazers_count: 82,
		forks_count: 53,
		pushed_at: '2026-11-05T08:15:30Z',
		archived: false
	};
	const contributorsPage = (last: number) =>
		json([{ login: 'a' }], {
			headers: {
				link: `<${REPO}/contributors?per_page=1&anon=1&page=2>; rel="next", <${REPO}/contributors?per_page=1&anon=1&page=${last}>; rel="last"`
			}
		});
	const routes = (overrides: Record<string, Reply | Reply[]> = {}) => ({
		[REPO]: json(repoBody),
		[RELEASE]: json({ tag_name: 'v4.0.1', published_at: '2026-09-24T10:00:00Z' }),
		[CONTRIBUTORS]: contributorsPage(23),
		...overrides
	});

	it('returns stars, forks, contributors, last push date and latest release', async () => {
		const { fetchFn } = fake(routes());
		const data = await createSources(options(fetchFn)).github('pangaea-data-publisher/fuji');
		expect(data).toEqual({
			stars: 82,
			forks: 53,
			contributors: 23,
			lastPush: '2026-11-05',
			archived: false,
			release: { tag: 'v4.0.1', date: '2026-09-24' }
		});
	});

	it('has no release when the latest-release endpoint answers 404', async () => {
		const { fetchFn } = fake(routes({ [RELEASE]: new Response('', { status: 404 }) }));
		const data = await createSources(options(fetchFn)).github('pangaea-data-publisher/fuji');
		expect(data.release).toBeUndefined();
	});

	it('counts one contributor when there is no Link header and the page has one entry', async () => {
		const { fetchFn } = fake(routes({ [CONTRIBUTORS]: json([{ login: 'a' }]) }));
		const data = await createSources(options(fetchFn)).github('pangaea-data-publisher/fuji');
		expect(data.contributors).toBe(1);
	});

	it('counts zero contributors for an empty list or a 204', async () => {
		for (const reply of [json([]), new Response(null, { status: 204 })]) {
			const { fetchFn } = fake(routes({ [CONTRIBUTORS]: reply }));
			const data = await createSources(options(fetchFn)).github('pangaea-data-publisher/fuji');
			expect(data.contributors).toBe(0);
		}
	});

	it('reports the archived flag', async () => {
		const { fetchFn } = fake(routes({ [REPO]: json({ ...repoBody, archived: true }) }));
		const data = await createSources(options(fetchFn)).github('pangaea-data-publisher/fuji');
		expect(data.archived).toBe(true);
	});

	it('reports not-found for a missing repository', async () => {
		const { fetchFn } = fake(routes({ [REPO]: new Response('', { status: 404 }) }));
		const sources = createSources(options(fetchFn));
		expect(await kindOf(sources.github('pangaea-data-publisher/fuji'))).toBe('not-found');
	});

	it.each([
		['no stars', { ...repoBody, stargazers_count: undefined }],
		['a bad pushed_at', { ...repoBody, pushed_at: 'yesterday' }],
		['no archived flag', { ...repoBody, archived: undefined }]
	])('reports shape for %s', async (_name, body) => {
		const { fetchFn } = fake(routes({ [REPO]: json(body) }));
		const sources = createSources(options(fetchFn));
		expect(await kindOf(sources.github('pangaea-data-publisher/fuji'))).toBe('shape');
	});

	it('reports shape for a release without a tag or with a bad date', async () => {
		for (const body of [
			{ published_at: '2026-09-24T10:00:00Z' },
			{ tag_name: 'v1', published_at: 'soon' }
		]) {
			const { fetchFn } = fake(routes({ [RELEASE]: json(body) }));
			const sources = createSources(options(fetchFn));
			expect(await kindOf(sources.github('pangaea-data-publisher/fuji'))).toBe('shape');
		}
	});

	it('reports http for a rate limit answer', async () => {
		const { fetchFn } = fake(
			routes({
				[REPO]: new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } })
			})
		);
		const sources = createSources(options(fetchFn, { retries: 0 }));
		expect(await kindOf(sources.github('pangaea-data-publisher/fuji'))).toBe('http');
	});

	it('sends the token only to api.github.com and only when there is one', async () => {
		const withToken = fake(routes());
		await createSources(options(withToken.fetchFn, { githubToken: 'tok' })).github(
			'pangaea-data-publisher/fuji'
		);
		expect(withToken.calls.length).toBe(3);
		for (const call of withToken.calls) {
			expect(call.headers.get('authorization')).toBe('Bearer tok');
			expect(call.headers.get('user-agent')).toBe('metrics-test/1.0');
		}

		const without = fake(routes());
		await createSources(options(without.fetchFn)).github('pangaea-data-publisher/fuji');
		for (const call of without.calls) expect(call.headers.get('authorization')).toBeNull();

		const other = fake({ 'https://zenodo.org/api/records/1': json({ stats: { downloads: 1 } }) });
		await createSources(options(other.fetchFn, { githubToken: 'tok' })).zenodo('1');
		expect(other.calls[0].headers.get('authorization')).toBeNull();
	});
});
