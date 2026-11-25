import { describe, expect, it } from 'vitest';
import { UsageError, parseMetricsArgs } from './metrics-cli';
import type { EntryResult } from './metrics-refresh';
import {
	formatCommitBody,
	formatFailureReport,
	formatMetricsSummary,
	formatMetricsTable
} from './metrics-report';

describe('parseMetricsArgs', () => {
	it('defaults to a dry run over every entry', () => {
		expect(parseMetricsArgs([])).toEqual({ write: false, all: false, only: undefined });
	});

	it('reads --write, --all and --only in both forms', () => {
		expect(parseMetricsArgs(['--write'])).toMatchObject({ write: true });
		expect(parseMetricsArgs(['--all'])).toMatchObject({ all: true });
		expect(parseMetricsArgs(['--only', 'f-uji'])).toMatchObject({ only: 'f-uji' });
		expect(parseMetricsArgs(['--only=f-uji', '--write'])).toEqual({
			write: true,
			all: false,
			only: 'f-uji'
		});
	});

	it.each([
		[['--wat'], /unknown argument --wat/],
		[['--only'], /--only needs a tool id/],
		[['--only', '--write'], /--only needs a tool id/],
		[['--only='], /--only needs a tool id/],
		[['positional'], /unknown argument positional/]
	])('rejects %j with a usage error', (argv, message) => {
		expect(() => parseMetricsArgs(argv)).toThrow(UsageError);
		expect(() => parseMetricsArgs(argv)).toThrow(message);
	});
});

const results = (): EntryResult[] => [
	{
		toolId: 'f-uji',
		metrics: { checked: '2026-12-07', citations: [{ label: 'a', doi: '10.1234/a', count: 124 }] },
		changes: [
			{
				toolId: 'f-uji',
				field: 'citations 10.1234/a',
				path: ['metrics', 'citations', 0, 'count'],
				recorded: 110,
				current: 124
			},
			{
				toolId: 'f-uji',
				field: 'checked',
				path: ['metrics', 'checked'],
				recorded: '2026-11-24',
				current: '2026-12-07'
			}
		],
		rows: [
			{
				toolId: 'f-uji',
				field: 'citations 10.1234/a',
				recorded: 110,
				current: 124,
				status: 'changed'
			},
			{ toolId: 'f-uji', field: 'github.stars', recorded: 82, current: 82, status: 'unchanged' }
		],
		failures: []
	},
	{
		toolId: 'rsfc',
		metrics: { checked: '2026-11-24', downloads: [] as never },
		changes: [],
		rows: [
			{
				toolId: 'rsfc',
				field: 'downloads pypi rsfc',
				recorded: 167,
				current: undefined,
				status: 'kept'
			}
		],
		failures: [
			{
				toolId: 'rsfc',
				field: 'downloads pypi rsfc',
				kind: 'http',
				message: 'HTTP 429 from pypistats.org'
			}
		]
	}
];

describe('formatMetricsTable', () => {
	it('lists changed and kept values with the recorded and the current number', () => {
		const table = formatMetricsTable(results(), { all: false });
		expect(table).toContain('f-uji');
		expect(table).toMatch(/citations 10\.1234\/a\s+110\s+124/);
		expect(table).toMatch(/rsfc\s+downloads pypi rsfc\s+167\s+-/);
		expect(table).not.toContain('github.stars');
		expect(table.split('\n')[0]).toMatch(/entry\s+value\s+recorded\s+current\s+status/);
	});

	it('lists unchanged values too with --all', () => {
		expect(formatMetricsTable(results(), { all: true })).toMatch(
			/github\.stars\s+82\s+82\s+unchanged/
		);
	});

	it('says so when there is nothing to list', () => {
		expect(formatMetricsTable([], { all: false })).toBe('No values to list.');
	});
});

describe('formatMetricsSummary', () => {
	it('counts entries, changed values (not the date) and failures', () => {
		expect(formatMetricsSummary(results(), { write: false })).toBe(
			'metrics: 2 entries checked, 1 value changed, 1 failure (dry run, nothing written)'
		);
		expect(formatMetricsSummary(results(), { write: true })).toBe(
			'metrics: 2 entries checked, 1 value changed, 1 failure (written)'
		);
	});

	it('uses the plural forms', () => {
		const two = results();
		two[0].changes.splice(1, 0, { ...two[0].changes[0], field: 'b' });
		expect(formatMetricsSummary(two, { write: true })).toContain('2 values changed');
		expect(formatMetricsSummary([], { write: true })).toBe(
			'metrics: 0 entries checked, 0 values changed, 0 failures (written)'
		);
	});
});

describe('formatFailureReport', () => {
	it('is exactly "No findings." when nothing failed', () => {
		expect(formatFailureReport([results()[0]], '2026-12-07')).toBe('No findings.\n');
	});

	it('lists each failure with entry, value, kind and message under a dated heading', () => {
		const report = formatFailureReport(results(), '2026-12-07');
		expect(report).toContain('2026-12-07');
		expect(report).toMatch(
			/\| rsfc \| downloads pypi rsfc \| http \| HTTP 429 from pypistats\.org \|/
		);
		expect(report).not.toContain('No findings.');
	});

	it('uses no em dash or en dash', () => {
		const report = formatFailureReport(results(), '2026-12-07');
		expect(report).not.toMatch(/[–—]/);
	});
});

describe('formatCommitBody', () => {
	it('lists every changed value with the old and the new number, one line each', () => {
		const body = formatCommitBody(results(), '2026-12-07');
		expect(body).toContain('Numbers refreshed on 2026-12-07');
		expect(body).toContain('- f-uji: citations 10.1234/a 110 -> 124');
		expect(body).not.toContain('checked');
		expect(body).not.toMatch(/co-authored|generated with/i);
	});

	it('is empty when nothing changed', () => {
		expect(formatCommitBody([results()[1]], '2026-12-07')).toBe('');
	});
});
