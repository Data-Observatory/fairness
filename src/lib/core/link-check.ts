// Link checking and freshness reporting. Framework-free: the HTTP client is injected, so the
// logic runs without a network in tests. Only HEAD and GET requests are ever made.
import type { Content } from './content.ts';
import { daysSince, localIsoDate } from './freshness.ts';

export type UrlUsage = { toolId?: string; field: string };
export type UrlEntry = { url: string; usages: UrlUsage[] };

export type LinkStatus =
	'ok' | 'redirect-other-host' | 'client-error' | 'server-error' | 'network-error' | 'timeout';

export type LinkResult = {
	url: string;
	status: LinkStatus;
	httpStatus?: number;
	finalUrl?: string;
	error?: string;
};

export type CheckOptions = {
	fetch: typeof fetch;
	timeoutMs: number;
	retries: number;
	userAgent: string;
	/** Pause between attempts of one url. Defaults to 0. */
	retryDelayMs?: number;
};

export type StaleTool = { id: string; lastVerified: string; days: number };

// ---------------------------------------------------------------------------------------------
// collectUrls

/** Every URL of the content (site and tools), deduplicated, sorted by URL, with all usages. */
export function collectUrls(content: Content): UrlEntry[] {
	const byUrl = new Map<string, UrlUsage[]>();
	const add = (url: string | undefined, field: string, toolId?: string) => {
		if (url === undefined) return;
		const usage: UrlUsage = toolId === undefined ? { field } : { toolId, field };
		const list = byUrl.get(url);
		if (list) list.push(usage);
		else byUrl.set(url, [usage]);
	};

	add(content.site.repository, 'repository');
	add(content.site.contributeUrl, 'contributeUrl');
	for (const tool of content.tools) {
		add(tool.url, 'url', tool.id);
		add(tool.operator.url, 'operator.url', tool.id);
		add(tool.api?.url, 'api.url', tool.id);
		add(tool.source_code, 'source_code', tool.id);
		tool.references?.forEach((reference, index) =>
			add(reference.url, `references.${index}.url`, tool.id)
		);
	}
	return [...byUrl.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([url, usages]) => ({ url, usages }));
}

// ---------------------------------------------------------------------------------------------
// checkUrl

const GET_FALLBACK_STATUSES = new Set([403, 405, 501]);

type Attempt = { result: LinkResult; retry: boolean };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function describeError(error: unknown): string {
	if (error instanceof Error) {
		const cause = (error as { cause?: unknown }).cause;
		const code =
			cause && typeof cause === 'object' && 'code' in cause
				? String((cause as { code: unknown }).code)
				: cause instanceof Error
					? cause.message
					: undefined;
		return code && !error.message.includes(code) ? `${error.message} (${code})` : error.message;
	}
	return String(error);
}

function hostOf(url: string): string | undefined {
	try {
		return new URL(url).host.toLowerCase();
	} catch {
		return undefined;
	}
}

function classify(url: string, response: Response): LinkResult {
	const httpStatus = response.status;
	if (httpStatus >= 200 && httpStatus < 300) {
		const finalUrl = response.url;
		if (response.redirected && finalUrl && hostOf(finalUrl) !== hostOf(url)) {
			return { url, status: 'redirect-other-host', httpStatus, finalUrl };
		}
		return { url, status: 'ok', httpStatus };
	}
	if (httpStatus >= 500) return { url, status: 'server-error', httpStatus };
	return { url, status: 'client-error', httpStatus };
}

async function request(
	url: string,
	method: 'HEAD' | 'GET',
	options: CheckOptions
): Promise<{ response: Response } | { error: unknown; timedOut: boolean }> {
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort(new Error(`Timed out after ${options.timeoutMs} ms`));
	}, options.timeoutMs);
	try {
		const response = await options.fetch(url, {
			method,
			redirect: 'follow',
			headers: { 'user-agent': options.userAgent },
			signal: controller.signal
		});
		// Only the status line matters: release the connection without reading the body.
		try {
			await response.body?.cancel();
		} catch {
			// ignored
		}
		return { response };
	} catch (error) {
		return { error, timedOut };
	} finally {
		clearTimeout(timer);
	}
}

async function attempt(url: string, options: CheckOptions): Promise<Attempt> {
	let outcome = await request(url, 'HEAD', options);
	// A timeout is retried as a whole instead of repeating the request as GET.
	const timedOutOnHead = 'error' in outcome && outcome.timedOut;
	const needsGet =
		!timedOutOnHead && ('error' in outcome || GET_FALLBACK_STATUSES.has(outcome.response.status));
	if (needsGet) outcome = await request(url, 'GET', options);

	if ('error' in outcome) {
		if (outcome.timedOut) {
			return {
				result: { url, status: 'timeout', error: describeError(outcome.error) },
				retry: true
			};
		}
		return {
			result: { url, status: 'network-error', error: describeError(outcome.error) },
			retry: true
		};
	}
	const result = classify(url, outcome.response);
	return { result, retry: result.status === 'server-error' };
}

/** Checks one URL. Never throws. 4xx is final; 5xx, timeouts and network errors are retried. */
export async function checkUrl(url: string, options: CheckOptions): Promise<LinkResult> {
	let last: LinkResult = { url, status: 'network-error', error: 'No request made' };
	for (let index = 0; index <= options.retries; index += 1) {
		if (index > 0 && options.retryDelayMs) await sleep(options.retryDelayMs);
		let next: Attempt;
		try {
			next = await attempt(url, options);
		} catch (error) {
			next = {
				result: { url, status: 'network-error', error: describeError(error) },
				retry: true
			};
		}
		last = next.result;
		if (!next.retry) break;
	}
	return last;
}

/** Checks every URL with at most `concurrency` requests in flight. Results keep the input order. */
export async function checkLinks(
	urls: string[],
	options: CheckOptions & { concurrency: number }
): Promise<LinkResult[]> {
	const results: LinkResult[] = new Array(urls.length);
	let next = 0;
	const worker = async () => {
		while (next < urls.length) {
			const index = next;
			next += 1;
			results[index] = await checkUrl(urls[index], options);
		}
	};
	const workers = Math.max(1, Math.min(Math.floor(options.concurrency), urls.length));
	await Promise.all(Array.from({ length: urls.length === 0 ? 0 : workers }, worker));
	return results;
}

// ---------------------------------------------------------------------------------------------
// staleTools

/** Tools not verified within `site.verification.staleAfterDays`, oldest first (ties by id). */
export function staleTools(content: Content, today: Date): StaleTool[] {
	const limit = content.site.verification.staleAfterDays;
	return content.tools
		.map((tool) => ({
			id: tool.id,
			lastVerified: tool.last_verified,
			days: daysSince(tool.last_verified, today)
		}))
		.filter((item) => item.days > limit)
		.sort((a, b) => b.days - a.days || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------------------------------------
// formatLinkReport

export const REPORT_DISCLAIMER =
	'A 200 response does not confirm the tool works. Confirm by hand and update `last_verified`.';

export type LinkReportInput = {
	results: LinkResult[];
	usages: Map<string, UrlUsage[]> | Record<string, UrlUsage[]>;
	stale: StaleTool[];
	today: Date;
	staleAfterDays: number;
};

// Dashes and symbol characters that error messages from the network stack may carry.
const FORBIDDEN_IN_REPORT = /[\u2013\u2014]|[\u2600-\u27BF]|[\u{1F000}-\u{1FAFF}]|\uFE0F/gu;

const clean = (text: string) =>
	text
		.replace(FORBIDDEN_IN_REPORT, (char) => (char === '\u2013' || char === '\u2014' ? '-' : ''))
		.replace(/\s+/g, ' ')
		.trim();

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function usageLabel(usage: UrlUsage): string {
	return usage.toolId === undefined ? `site ${usage.field}` : `${usage.toolId} ${usage.field}`;
}

export function formatLinkReport(input: LinkReportInput): {
	markdown: string;
	hasFindings: boolean;
} {
	const lookup = (url: string): UrlUsage[] =>
		(input.usages instanceof Map ? input.usages.get(url) : input.usages[url]) ?? [];

	const problems = input.results
		.filter((result) => result.status !== 'ok')
		.sort((a, b) => byString(a.url, b.url));
	const okCount = input.results.length - problems.length;
	const hasFindings = problems.length > 0 || input.stale.length > 0;

	const lines: string[] = [`# Link check report ${localIsoDate(input.today)}`, ''];
	lines.push(
		`Links checked: ${input.results.length}. ok: ${okCount}. With problems: ${problems.length}.`,
		`Tools not verified in more than ${input.staleAfterDays} days: ${input.stale.length}.`,
		''
	);

	if (!hasFindings) {
		lines.push('No findings.', '');
	}

	if (problems.length > 0) {
		lines.push('## Links with problems', '');
		for (const result of problems) {
			const parts: string[] = [result.status];
			if (result.httpStatus !== undefined) parts.push(`HTTP ${result.httpStatus}`);
			if (result.finalUrl) parts.push(`final URL ${clean(result.finalUrl)}`);
			if (result.error) parts.push(clean(result.error));
			const where = [...lookup(result.url)]
				.sort((a, b) => byString(usageLabel(a), usageLabel(b)))
				.map((usage) =>
					usage.toolId === undefined ? usage.field : `${usage.toolId}: ${usage.field}`
				);
			const used = where.length > 0 ? ` (used in ${where.join('; ')})` : '';
			lines.push(`- ${clean(result.url)}: ${parts.join(', ')}${used}`);
		}
		lines.push('');
	}

	if (input.stale.length > 0) {
		lines.push(`## Tools not re-verified in more than ${input.staleAfterDays} days`, '');
		for (const item of input.stale) {
			lines.push(`- ${item.id}: last_verified ${item.lastVerified}, ${item.days} days ago`);
		}
		lines.push('');
	}

	lines.push(REPORT_DISCLAIMER, '');
	return { markdown: lines.join('\n'), hasFindings };
}
