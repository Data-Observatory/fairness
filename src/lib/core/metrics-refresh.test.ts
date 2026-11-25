import { describe, expect, it, vi } from 'vitest';
import { refreshEntry, type RefreshInput } from './metrics-refresh';
import { SourceError, type GithubData, type Sources } from './metrics-sources';
import type { Metrics } from './schema';

// No network: the sources are fakes. The rules under test: a refreshed value replaces the recorded
// one, a failed or suspicious value never does, and nothing is ever removed.

const TODAY = '2026-12-07';

const recorded = (): Metrics => ({
	checked: '2026-11-24',
	citations: [{ label: 'Patterns, 2021', doi: '10.1016/j.patter.2021.100370', count: 110 }],
	github: {
		stars: 82,
		forks: 53,
		contributors: 23,
		last_push: '2026-11-05',
		last_release: { tag: 'v4.0.1', date: '2026-09-24' }
	},
	downloads: [
		{ source: 'zenodo', record: '15045911', count: 17372, period: 'total' },
		{ source: 'pypi', package: 'howfairis', count: 2114, period: 'last_30_days' }
	]
});

const entry = (metrics: Metrics = recorded(), extra: Partial<RefreshInput> = {}): RefreshInput => ({
	id: 'f-uji',
	source_code: 'https://github.com/pangaea-data-publisher/fuji',
	metrics,
	...extra
});

const githubNow = (extra: Partial<GithubData> = {}): GithubData => ({
	stars: 82,
	forks: 53,
	contributors: 23,
	lastPush: '2026-11-05',
	archived: false,
	release: { tag: 'v4.0.1', date: '2026-09-24' },
	...extra
});

// Sources that return exactly what is recorded, unless a test overrides one.
function sources(overrides: Partial<Sources> = {}) {
	const base = {
		openalex: vi.fn(async () => 110),
		github: vi.fn(async () => githubNow()),
		zenodo: vi.fn(async () => 17372),
		pypi: vi.fn(async () => 2114)
	};
	return { ...base, ...overrides } as Sources & typeof base;
}

const fail = (kind: ConstructorParameters<typeof SourceError>[0], message = 'boom') =>
	vi.fn(async () => {
		throw new SourceError(kind, message);
	});

describe('refreshEntry: unchanged numbers', () => {
	it('reports nothing and keeps the date when every value is the same', async () => {
		const result = await refreshEntry(entry(), sources(), TODAY);
		expect(result.changes).toEqual([]);
		expect(result.failures).toEqual([]);
		expect(result.metrics).toEqual(recorded());
		expect(result.metrics.checked).toBe('2026-11-24');
		expect(result.rows.every((row) => row.status === 'unchanged')).toBe(true);
		// One row per value: 1 citation, 6 GitHub values (release tag and date count separately), 2 downloads.
		expect(result.rows.length).toBe(9);
	});

	it('is idempotent: feeding the refreshed metrics back with the same data changes nothing', async () => {
		const source = sources({ openalex: vi.fn(async () => 115), zenodo: vi.fn(async () => 18000) });
		const first = await refreshEntry(entry(), source, TODAY);
		expect(first.changes.length).toBeGreaterThan(0);
		const second = await refreshEntry(entry(first.metrics), source, '2026-12-14');
		expect(second.changes).toEqual([]);
		expect(second.metrics).toEqual(first.metrics);
	});

	it('does not modify its input', async () => {
		const input = entry();
		const copy = structuredClone(input);
		await refreshEntry(input, sources({ openalex: vi.fn(async () => 500) }), TODAY);
		expect(input).toEqual(copy);
	});
});

describe('refreshEntry: changed numbers', () => {
	it('updates a citation count and bumps the checked date', async () => {
		const result = await refreshEntry(
			entry(),
			sources({ openalex: vi.fn(async () => 124) }),
			TODAY
		);
		expect(result.metrics.citations![0].count).toBe(124);
		expect(result.metrics.checked).toBe(TODAY);
		expect(result.changes).toEqual([
			{
				toolId: 'f-uji',
				field: 'citations 10.1016/j.patter.2021.100370',
				path: ['metrics', 'citations', 0, 'count'],
				recorded: 110,
				current: 124
			},
			{
				toolId: 'f-uji',
				field: 'checked',
				path: ['metrics', 'checked'],
				recorded: '2026-11-24',
				current: TODAY
			}
		]);
		expect(result.failures).toEqual([]);
	});

	it('updates the GitHub numbers, the last push and the release', async () => {
		const result = await refreshEntry(
			entry(),
			sources({
				github: vi.fn(async () =>
					githubNow({
						stars: 90,
						forks: 55,
						contributors: 25,
						lastPush: '2026-12-01',
						release: { tag: 'v4.1.0', date: '2026-11-30' }
					})
				)
			}),
			TODAY
		);
		expect(result.metrics.github).toEqual({
			stars: 90,
			forks: 55,
			contributors: 25,
			last_push: '2026-12-01',
			last_release: { tag: 'v4.1.0', date: '2026-11-30' }
		});
		expect(result.changes.map((change) => change.path.join('.'))).toEqual([
			'metrics.github.stars',
			'metrics.github.forks',
			'metrics.github.contributors',
			'metrics.github.last_push',
			'metrics.github.last_release.tag',
			'metrics.github.last_release.date',
			'metrics.checked'
		]);
	});

	it('lets stars, forks and contributors go down', async () => {
		const result = await refreshEntry(
			entry(),
			sources({ github: vi.fn(async () => githubNow({ stars: 5, forks: 1, contributors: 2 })) }),
			TODAY
		);
		expect(result.metrics.github).toMatchObject({ stars: 5, forks: 1, contributors: 2 });
		expect(result.failures).toEqual([]);
	});

	it('adds a release when none was recorded', async () => {
		const metrics = recorded();
		delete metrics.github!.last_release;
		const result = await refreshEntry(entry(metrics), sources(), TODAY);
		expect(result.metrics.github!.last_release).toEqual({ tag: 'v4.0.1', date: '2026-09-24' });
		expect(result.changes[0]).toEqual({
			toolId: 'f-uji',
			field: 'github.last_release',
			path: ['metrics', 'github', 'last_release'],
			recorded: undefined,
			current: { tag: 'v4.0.1', date: '2026-09-24' }
		});
	});

	it('keeps the recorded release when the source reports none, without a failure', async () => {
		const result = await refreshEntry(
			entry(),
			sources({ github: vi.fn(async () => githubNow({ release: undefined })) }),
			TODAY
		);
		expect(result.metrics.github!.last_release).toEqual({ tag: 'v4.0.1', date: '2026-09-24' });
		expect(result.changes).toEqual([]);
		expect(result.failures).toEqual([]);
	});

	it('fetches downloads by the recorded Zenodo record and PyPI package', async () => {
		const source = sources({ zenodo: vi.fn(async () => 17500), pypi: vi.fn(async () => 2300) });
		const result = await refreshEntry(entry(), source, TODAY);
		expect(source.zenodo).toHaveBeenCalledWith('15045911');
		expect(source.pypi).toHaveBeenCalledWith('howfairis');
		expect(source.github).toHaveBeenCalledWith('pangaea-data-publisher/fuji');
		expect(source.openalex).toHaveBeenCalledWith('10.1016/j.patter.2021.100370');
		expect(result.metrics.downloads!.map((item) => item.count)).toEqual([17500, 2300]);
		expect(result.changes.map((change) => change.path.join('.'))).toContain(
			'metrics.downloads.1.count'
		);
	});

	it('strips .git, a trailing slash and deeper paths from the repository URL', async () => {
		for (const url of [
			'https://github.com/pangaea-data-publisher/fuji.git',
			'https://github.com/pangaea-data-publisher/fuji/',
			'https://github.com/pangaea-data-publisher/fuji/tree/main/docs'
		]) {
			const source = sources();
			await refreshEntry(entry(recorded(), { source_code: url }), source, TODAY);
			expect(source.github).toHaveBeenCalledWith('pangaea-data-publisher/fuji');
		}
	});
});

describe('refreshEntry: failures keep the recorded value', () => {
	it('keeps a value whose source failed, reports it, still refreshes the others, and keeps the date', async () => {
		const result = await refreshEntry(
			entry(),
			sources({ openalex: fail('http', 'HTTP 500'), zenodo: vi.fn(async () => 17500) }),
			TODAY
		);
		expect(result.metrics.citations![0].count).toBe(110);
		expect(result.metrics.downloads![0].count).toBe(17500);
		expect(result.failures).toEqual([
			{
				toolId: 'f-uji',
				field: 'citations 10.1016/j.patter.2021.100370',
				kind: 'http',
				message: 'HTTP 500'
			}
		]);
		// The new date would overstate how fresh the kept value is, so it is not bumped.
		expect(result.metrics.checked).toBe('2026-11-24');
		expect(result.changes.map((change) => change.field)).toEqual(['downloads zenodo 15045911']);
	});

	it.each(['not-found', 'shape', 'network', 'http'] as const)(
		'reports a %s failure with its kind',
		async (kind) => {
			const result = await refreshEntry(entry(), sources({ zenodo: fail(kind, 'why') }), TODAY);
			expect(result.failures).toEqual([
				{ toolId: 'f-uji', field: 'downloads zenodo 15045911', kind, message: 'why' }
			]);
		}
	);

	it('reports an unexpected error as kind fetch', async () => {
		const result = await refreshEntry(
			entry(),
			sources({
				pypi: vi.fn(async () => {
					throw new TypeError('x is not a function');
				})
			}),
			TODAY
		);
		expect(result.failures).toEqual([
			{
				toolId: 'f-uji',
				field: 'downloads pypi howfairis',
				kind: 'fetch',
				message: 'x is not a function'
			}
		]);
	});

	it('never removes a part or a field, even when every source fails', async () => {
		const down = {
			openalex: fail('network'),
			github: fail('network'),
			zenodo: fail('network'),
			pypi: fail('network')
		};
		const result = await refreshEntry(entry(), sources(down), TODAY);
		expect(result.metrics).toEqual(recorded());
		expect(result.changes).toEqual([]);
		expect(result.failures.length).toBe(4);
		expect(result.rows.every((row) => row.status === 'kept')).toBe(true);
	});

	it.each([
		['a negative count', -1],
		['a fractional count', 3.5],
		['NaN', Number.NaN],
		['a string', '12' as unknown as number]
	])('rejects %s from a source as a shape failure', async (_name, value) => {
		const result = await refreshEntry(
			entry(),
			sources({ openalex: vi.fn(async () => value) }),
			TODAY
		);
		expect(result.metrics.citations![0].count).toBe(110);
		expect(result.failures).toMatchObject([{ kind: 'shape' }]);
	});

	it('rejects an invalid date from the GitHub source as a shape failure and keeps all GitHub numbers', async () => {
		const result = await refreshEntry(
			entry(),
			sources({ github: vi.fn(async () => githubNow({ stars: 99, lastPush: '2026-13-40' })) }),
			TODAY
		);
		expect(result.metrics.github).toEqual(recorded().github);
		expect(result.failures).toMatchObject([{ field: 'github', kind: 'shape' }]);
	});
});

describe('refreshEntry: guards', () => {
	it('keeps a citation count that fell below half of the recorded one and reports it', async () => {
		const result = await refreshEntry(entry(), sources({ openalex: vi.fn(async () => 54) }), TODAY);
		expect(result.metrics.citations![0].count).toBe(110);
		expect(result.failures).toMatchObject([
			{ field: 'citations 10.1016/j.patter.2021.100370', kind: 'guarded-drop' }
		]);
		expect(result.failures[0].message).toContain('110');
		expect(result.failures[0].message).toContain('54');
	});

	it('accepts a citation drop of exactly half or less than half', async () => {
		for (const now of [55, 100]) {
			const result = await refreshEntry(
				entry(),
				sources({ openalex: vi.fn(async () => now) }),
				TODAY
			);
			expect(result.metrics.citations![0].count).toBe(now);
			expect(result.failures).toEqual([]);
		}
	});

	it('applies the same guard to total downloads but not to a 30 day window', async () => {
		const result = await refreshEntry(
			entry(),
			sources({ zenodo: vi.fn(async () => 100), pypi: vi.fn(async () => 100) }),
			TODAY
		);
		expect(result.metrics.downloads![0].count).toBe(17372);
		expect(result.metrics.downloads![1].count).toBe(100);
		expect(result.failures).toMatchObject([
			{ field: 'downloads zenodo 15045911', kind: 'guarded-drop' }
		]);
	});

	it('does not guard a citation count of zero', async () => {
		const metrics = recorded();
		metrics.citations![0].count = 0;
		const result = await refreshEntry(entry(metrics), sources({ openalex: async () => 0 }), TODAY);
		expect(result.failures).toEqual([]);
	});

	it('keeps all GitHub values of an archived repository and reports it', async () => {
		const result = await refreshEntry(
			entry(),
			sources({ github: vi.fn(async () => githubNow({ stars: 200, archived: true })) }),
			TODAY
		);
		expect(result.metrics.github).toEqual(recorded().github);
		expect(result.failures).toMatchObject([{ field: 'github', kind: 'archived' }]);
	});

	it('keeps the GitHub values of a repository that is gone and reports it', async () => {
		const result = await refreshEntry(entry(), sources({ github: fail('not-found') }), TODAY);
		expect(result.metrics.github).toEqual(recorded().github);
		expect(result.failures).toMatchObject([{ field: 'github', kind: 'not-found' }]);
	});

	it('reports a downloads item without its identifier and fetches nothing for it', async () => {
		const metrics = recorded();
		delete metrics.downloads![0].record;
		delete metrics.downloads![1].package;
		const source = sources();
		const result = await refreshEntry(entry(metrics), source, TODAY);
		expect(source.zenodo).not.toHaveBeenCalled();
		expect(source.pypi).not.toHaveBeenCalled();
		expect(result.failures).toMatchObject([
			{ field: 'downloads zenodo', kind: 'missing-id' },
			{ field: 'downloads pypi', kind: 'missing-id' }
		]);
	});

	it('reports GitHub numbers on an entry whose source code is not a github.com repository', async () => {
		const source = sources();
		const result = await refreshEntry(
			entry(recorded(), { source_code: 'https://gitlab.com/group/project' }),
			source,
			TODAY
		);
		expect(source.github).not.toHaveBeenCalled();
		expect(result.failures).toMatchObject([{ field: 'github', kind: 'unsupported' }]);
		expect(result.metrics.github).toEqual(recorded().github);
	});
});

describe('refreshEntry: parts that are not recorded stay not recorded', () => {
	it('asks the sources only for what the entry records', async () => {
		const source = sources();
		const only: Metrics = { checked: '2026-11-24', citations: recorded().citations };
		const result = await refreshEntry(entry(only, { source_code: undefined }), source, TODAY);
		expect(source.openalex).toHaveBeenCalledTimes(1);
		expect(source.github).not.toHaveBeenCalled();
		expect(source.zenodo).not.toHaveBeenCalled();
		expect(source.pypi).not.toHaveBeenCalled();
		expect(Object.keys(result.metrics).sort()).toEqual(['checked', 'citations']);
	});
});
