// The four places the recorded numbers come from: OpenAlex (citations), the GitHub API (stars,
// forks, contributors, last push, latest release), Zenodo (downloads of a record) and pypistats
// (downloads of a PyPI package in the last 30 days). Framework-free: the HTTP client is injected,
// so the logic runs without a network in tests. Only GET requests are made, and nothing is ever
// submitted to a third-party service. Every answer is checked for its shape; a value that does not
// have the expected shape is an error, never a number.
import { isIsoDate } from './iso-date.ts';

export type SourceErrorKind = 'not-found' | 'http' | 'network' | 'shape';

export class SourceError extends Error {
	readonly kind: SourceErrorKind;
	constructor(kind: SourceErrorKind, message: string) {
		super(message);
		this.name = 'SourceError';
		this.kind = kind;
	}
}

export type GithubData = {
	stars: number;
	forks: number;
	contributors: number;
	/** Date (YYYY-MM-DD) of `pushed_at`. */
	lastPush: string;
	archived: boolean;
	/** The latest release; absent when the repository has none. */
	release?: { tag: string; date: string };
};

export type Sources = {
	/** `cited_by_count` of the work with this bare DOI. */
	openalex(doi: string): Promise<number>;
	/** `owner/name` of a github.com repository. */
	github(repo: string): Promise<GithubData>;
	/** `stats.downloads` of a Zenodo record (all versions of the record). */
	zenodo(record: string): Promise<number>;
	/** Downloads of a PyPI package in the last 30 days. */
	pypi(pkg: string): Promise<number>;
};

export type SourceOptions = {
	fetch: typeof fetch;
	userAgent: string;
	timeoutMs: number;
	/** Extra attempts after a network error, a server error or a rate limit answer. Default 0. */
	retries?: number;
	/** Pause between attempts. Default 0. */
	retryDelayMs?: number;
	/** Sent only to api.github.com, as a bearer token. */
	githubToken?: string;
};

type Raw = { status: number; headers: Headers; text: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const hostOf = (url: string) => new URL(url).host;

const isCount = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The message of a failed fetch with the network error code from its cause, when there is one. */
function describe(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const cause = (error as { cause?: unknown }).cause;
	const code =
		cause && typeof cause === 'object' && 'code' in cause
			? String((cause as { code: unknown }).code)
			: cause instanceof Error
				? cause.message
				: undefined;
	return code && !error.message.includes(code) ? `${error.message} (${code})` : error.message;
}

function retryable(response: Response): boolean {
	if (response.status >= 500 || response.status === 429) return true;
	return response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0';
}

async function attempt(
	url: string,
	headers: Record<string, string>,
	options: SourceOptions
): Promise<{ raw: Raw; again: boolean } | { error: SourceError }> {
	const controller = new AbortController();
	const timer = setTimeout(
		() => controller.abort(new Error(`Timed out after ${options.timeoutMs} ms`)),
		options.timeoutMs
	);
	try {
		const response = await options.fetch(url, {
			method: 'GET',
			redirect: 'follow',
			headers,
			signal: controller.signal
		});
		const raw = { status: response.status, headers: response.headers, text: await response.text() };
		return { raw, again: retryable(response) };
	} catch (error) {
		return { error: new SourceError('network', `${hostOf(url)}: ${describe(error)}`) };
	} finally {
		clearTimeout(timer);
	}
}

async function get(
	url: string,
	headers: Record<string, string>,
	options: SourceOptions
): Promise<Raw> {
	const attempts = (options.retries ?? 0) + 1;
	let last: SourceError | undefined;
	for (let index = 0; index < attempts; index += 1) {
		const result = await attempt(url, headers, options);
		if ('error' in result) last = result.error;
		else if (!result.again) return result.raw;
		else last = new SourceError('http', `HTTP ${result.raw.status} from ${hostOf(url)}`);
		if (index < attempts - 1) await sleep(options.retryDelayMs ?? 0);
	}
	throw last ?? new SourceError('network', `${hostOf(url)}: no answer`);
}

/** 404 is not-found and any other non-2xx status is http. */
function ensureOk(raw: Raw, url: string): void {
	if (raw.status === 404) throw new SourceError('not-found', `HTTP 404 from ${hostOf(url)}`);
	if (raw.status < 200 || raw.status >= 300) {
		throw new SourceError('http', `HTTP ${raw.status} from ${hostOf(url)}`);
	}
}

function json(raw: Raw, url: string): unknown {
	try {
		return JSON.parse(raw.text);
	} catch {
		throw new SourceError('shape', `${hostOf(url)} did not answer with JSON`);
	}
}

function shape(url: string, what: string): SourceError {
	return new SourceError('shape', `${hostOf(url)}: ${what}`);
}

const dateOf = (value: unknown): string | undefined => {
	if (typeof value !== 'string') return undefined;
	const date = value.slice(0, 10);
	return /^\d{4}-\d{2}-\d{2}(T|$)/.test(value) && isIsoDate(date) ? date : undefined;
};

export function createSources(options: SourceOptions): Sources {
	const plain = { 'user-agent': options.userAgent, accept: 'application/json' };
	const githubHeaders: Record<string, string> = {
		'user-agent': options.userAgent,
		accept: 'application/vnd.github+json',
		'x-github-api-version': '2022-11-28',
		...(options.githubToken === undefined ? {} : { authorization: `Bearer ${options.githubToken}` })
	};

	async function getJson(url: string, headers: Record<string, string>) {
		const raw = await get(url, headers, options);
		ensureOk(raw, url);
		return { raw, body: json(raw, url) };
	}

	return {
		async openalex(doi) {
			const path = doi.split('/').map(encodeURIComponent).join('/');
			const url = `https://api.openalex.org/works/doi:${path}`;
			const { body } = await getJson(url, plain);
			if (!isRecord(body)) throw shape(url, 'unexpected answer');
			if (typeof body.title !== 'string' || body.title.trim() === '') {
				throw shape(url, 'the work has no title');
			}
			if (!isCount(body.cited_by_count)) throw shape(url, 'cited_by_count is not a count');
			return body.cited_by_count;
		},

		async zenodo(record) {
			const url = `https://zenodo.org/api/records/${encodeURIComponent(record)}`;
			const { body } = await getJson(url, plain);
			const downloads = isRecord(body) && isRecord(body.stats) ? body.stats.downloads : undefined;
			if (!isCount(downloads)) throw shape(url, 'stats.downloads is not a count');
			return downloads;
		},

		async pypi(pkg) {
			const url = `https://pypistats.org/api/packages/${encodeURIComponent(pkg)}/recent`;
			const { body } = await getJson(url, plain);
			const month = isRecord(body) && isRecord(body.data) ? body.data.last_month : undefined;
			if (!isCount(month)) throw shape(url, 'data.last_month is not a count');
			return month;
		},

		async github(repo) {
			const base = `https://api.github.com/repos/${repo}`;
			const { body } = await getJson(base, githubHeaders);
			if (!isRecord(body)) throw shape(base, 'unexpected answer');
			const lastPush = dateOf(body.pushed_at);
			if (
				!isCount(body.stargazers_count) ||
				!isCount(body.forks_count) ||
				lastPush === undefined ||
				typeof body.archived !== 'boolean'
			) {
				throw shape(base, 'the repository answer lacks stars, forks, pushed_at or archived');
			}

			const [release, contributors] = await Promise.all([
				latestRelease(`${base}/releases/latest`),
				contributorCount(`${base}/contributors?per_page=1&anon=1`)
			]);
			return {
				stars: body.stargazers_count,
				forks: body.forks_count,
				contributors,
				lastPush,
				archived: body.archived,
				...(release === undefined ? {} : { release })
			};
		}
	};

	async function latestRelease(url: string): Promise<{ tag: string; date: string } | undefined> {
		const raw = await get(url, githubHeaders, options);
		if (raw.status === 404) return undefined; // the repository has no release
		ensureOk(raw, url);
		const body = json(raw, url);
		const date = isRecord(body) ? dateOf(body.published_at) : undefined;
		if (!isRecord(body) || typeof body.tag_name !== 'string' || body.tag_name === '' || !date) {
			throw shape(url, 'the release lacks tag_name or published_at');
		}
		return { tag: body.tag_name, date };
	}

	// One entry per page, so the number of the last page is the number of contributors (anonymous
	// ones included). GitHub lists at most the first 500 contributors of a repository.
	async function contributorCount(url: string): Promise<number> {
		const raw = await get(url, githubHeaders, options);
		if (raw.status === 204) return 0;
		ensureOk(raw, url);
		const body = json(raw, url);
		if (!Array.isArray(body)) throw shape(url, 'the contributors answer is not a list');
		const last = /[?&]page=(\d+)>;\s*rel="last"/.exec(raw.headers.get('link') ?? '');
		return last ? Number(last[1]) : body.length;
	}
}
