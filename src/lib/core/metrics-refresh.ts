// The weekly refresh of the recorded numbers of one entry. Framework-free and without a network:
// the sources are injected. The rules, in short:
//  - a refreshed value replaces the recorded one;
//  - a value that could not be fetched, has the wrong shape, looks wrong (a citation count or a
//    total that fell below half of the recorded one, an archived or missing repository) is NOT
//    written: the recorded value stays and the problem is reported;
//  - nothing is ever removed, and nothing the entry does not record is ever added, except the
//    latest release of a repository that had none;
//  - `checked` moves to today only when a value changed and nothing failed in the entry, so the
//    date never claims more than what was refreshed;
//  - the input is not modified, and a second run with the same data changes nothing.
import { isIsoDate } from './iso-date.ts';
import { SourceError, type GithubData, type Sources } from './metrics-sources.ts';
import type { Metrics, Tool } from './schema.ts';

export type RefreshInput = Pick<Tool, 'id' | 'source_code'> & { metrics: Metrics };

export type ChangeValue = string | number | { tag: string; date: string };

export type Change = {
	toolId: string;
	/** What the value is, for reports: `citations <doi>`, `github.stars`, `checked`... */
	field: string;
	/** Where it is in the entry, from the root of the file. */
	path: (string | number)[];
	recorded?: string | number;
	/** An object only when a release is added to a repository that had none. */
	current: ChangeValue;
};

export type FailureKind =
	SourceError['kind'] | 'fetch' | 'guarded-drop' | 'archived' | 'missing-id' | 'unsupported';

export type Failure = { toolId: string; field: string; kind: FailureKind; message: string };

export type Row = {
	toolId: string;
	field: string;
	recorded?: string | number;
	current?: string | number;
	status: 'changed' | 'unchanged' | 'kept';
};

export type EntryResult = {
	toolId: string;
	/** The metrics after the refresh: a copy of the input with the accepted values replaced. */
	metrics: Metrics;
	changes: Change[];
	rows: Row[];
	failures: Failure[];
};

const isCount = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** `owner/name` of a github.com URL, or undefined. */
export function githubRepoOf(url: string | undefined): string | undefined {
	const match = /^https:\/\/github\.com\/([^/?#]+)\/([^/?#]+)/.exec(url ?? '');
	if (!match) return undefined;
	return `${match[1]}/${match[2].replace(/\.git$/, '')}`;
}

/** True when `current` fell below half of the recorded `previous`. */
const fellTooFar = (previous: number, current: number) => previous > 0 && current < previous / 2;

export async function refreshEntry(
	input: RefreshInput,
	sources: Sources,
	today: string
): Promise<EntryResult> {
	const toolId = input.id;
	const next: Metrics = structuredClone(input.metrics);
	const changes: Change[] = [];
	const rows: Row[] = [];
	const failures: Failure[] = [];

	const fail = (field: string, kind: FailureKind, message: string) =>
		failures.push({ toolId, field, kind, message });

	async function attempt<T>(field: string, fetchValue: () => Promise<T>): Promise<T | undefined> {
		try {
			return await fetchValue();
		} catch (error) {
			const kind = error instanceof SourceError ? error.kind : 'fetch';
			fail(field, kind, error instanceof Error ? error.message : String(error));
			return undefined;
		}
	}

	const keep = (field: string, recorded: string | number | undefined) =>
		rows.push({ toolId, field, recorded, current: undefined, status: 'kept' });

	/** Records one scalar: a change when it differs, a plain row when it does not. */
	function settle(
		field: string,
		path: (string | number)[],
		recorded: string | number,
		current: string | number,
		write: () => void
	) {
		if (recorded === current) {
			rows.push({ toolId, field, recorded, current, status: 'unchanged' });
			return;
		}
		write();
		changes.push({ toolId, field, path, recorded, current });
		rows.push({ toolId, field, recorded, current, status: 'changed' });
	}

	// Citations.
	for (const [index, item] of (next.citations ?? []).entries()) {
		const field = `citations ${item.doi}`;
		const value = await attempt(field, () => sources.openalex(item.doi));
		if (value === undefined) {
			keep(field, item.count);
		} else if (!isCount(value)) {
			fail(field, 'shape', `the source answered ${String(value)}, which is not a count`);
			keep(field, item.count);
		} else if (fellTooFar(item.count, value)) {
			fail(
				field,
				'guarded-drop',
				`count fell from ${item.count} to ${value} (below half), the recorded value was kept`
			);
			keep(field, item.count);
		} else {
			settle(field, ['metrics', 'citations', index, 'count'], item.count, value, () => {
				item.count = value;
			});
		}
	}

	// GitHub.
	if (next.github !== undefined) await refreshGithub(next.github);

	// Downloads.
	for (const [index, item] of (next.downloads ?? []).entries()) {
		const id = item.source === 'zenodo' ? item.record : item.package;
		const idName = item.source === 'zenodo' ? 'record' : 'package';
		if (id === undefined) {
			const field = `downloads ${item.source}`;
			fail(field, 'missing-id', `no ${idName} is recorded, so the number cannot be fetched again`);
			keep(field, item.count);
			continue;
		}
		const field = `downloads ${item.source} ${id}`;
		const value = await attempt(field, () =>
			item.source === 'zenodo' ? sources.zenodo(id) : sources.pypi(id)
		);
		if (value === undefined) {
			keep(field, item.count);
		} else if (!isCount(value)) {
			fail(field, 'shape', `the source answered ${String(value)}, which is not a count`);
			keep(field, item.count);
		} else if (item.period === 'total' && fellTooFar(item.count, value)) {
			fail(
				field,
				'guarded-drop',
				`total fell from ${item.count} to ${value} (below half), the recorded value was kept`
			);
			keep(field, item.count);
		} else {
			settle(field, ['metrics', 'downloads', index, 'count'], item.count, value, () => {
				item.count = value;
			});
		}
	}

	if (changes.length > 0 && failures.length === 0 && next.checked !== today) {
		changes.push({
			toolId,
			field: 'checked',
			path: ['metrics', 'checked'],
			recorded: next.checked,
			current: today
		});
		next.checked = today;
	}

	return { toolId, metrics: next, changes, rows, failures };

	async function refreshGithub(github: NonNullable<Metrics['github']>) {
		const release = github.last_release;
		const fields = [
			'github.stars',
			'github.forks',
			'github.contributors',
			'github.last_push',
			...(release === undefined ? [] : ['github.last_release.tag', 'github.last_release.date'])
		];
		const recordedOf: Record<string, string | number | undefined> = {
			'github.stars': github.stars,
			'github.forks': github.forks,
			'github.contributors': github.contributors,
			'github.last_push': github.last_push,
			'github.last_release.tag': release?.tag,
			'github.last_release.date': release?.date
		};
		const keepAll = () => fields.forEach((field) => keep(field, recordedOf[field]));

		const repo = githubRepoOf(input.source_code);
		if (repo === undefined) {
			fail('github', 'unsupported', 'source_code is not a github.com repository');
			keepAll();
			return;
		}
		const data: GithubData | undefined = await attempt('github', () => sources.github(repo));
		if (data === undefined) {
			keepAll();
			return;
		}
		const valid =
			isCount(data.stars) &&
			isCount(data.forks) &&
			isCount(data.contributors) &&
			isIsoDate(data.lastPush) &&
			(data.release === undefined || (data.release.tag !== '' && isIsoDate(data.release.date)));
		if (!valid) {
			fail('github', 'shape', 'the repository numbers or dates have an unexpected form');
			keepAll();
			return;
		}
		if (data.archived) {
			fail('github', 'archived', 'the repository is archived, the recorded values were kept');
			keepAll();
			return;
		}

		const base = ['metrics', 'github'];
		settle('github.stars', [...base, 'stars'], github.stars, data.stars, () => {
			github.stars = data.stars;
		});
		settle('github.forks', [...base, 'forks'], github.forks, data.forks, () => {
			github.forks = data.forks;
		});
		settle(
			'github.contributors',
			[...base, 'contributors'],
			github.contributors,
			data.contributors,
			() => {
				github.contributors = data.contributors;
			}
		);
		settle('github.last_push', [...base, 'last_push'], github.last_push, data.lastPush, () => {
			github.last_push = data.lastPush;
		});

		const found = data.release;
		if (release !== undefined) {
			// A release the source no longer lists is not removed from the entry.
			const tag = found?.tag ?? release.tag;
			const date = found?.date ?? release.date;
			settle('github.last_release.tag', [...base, 'last_release', 'tag'], release.tag, tag, () => {
				release.tag = tag;
			});
			settle(
				'github.last_release.date',
				[...base, 'last_release', 'date'],
				release.date,
				date,
				() => {
					release.date = date;
				}
			);
		} else if (found !== undefined) {
			github.last_release = { tag: found.tag, date: found.date };
			changes.push({
				toolId,
				field: 'github.last_release',
				path: [...base, 'last_release'],
				recorded: undefined,
				current: { tag: found.tag, date: found.date }
			});
			rows.push({
				toolId,
				field: 'github.last_release',
				recorded: undefined,
				current: `${found.tag} (${found.date})`,
				status: 'changed'
			});
		}
	}
}
