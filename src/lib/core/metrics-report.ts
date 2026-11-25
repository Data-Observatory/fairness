// Text output of the metrics refresh: the table of a dry run, the summary line, the Markdown
// report of the failures (the body of the `metrics-check` issue) and the body of the commit that
// the scheduled job makes. No dash characters other than the hyphen are used.
import type { Change, ChangeValue, EntryResult, Row } from './metrics-refresh.ts';

const show = (value: string | number | undefined) => (value === undefined ? '-' : String(value));

/** The date of an entry moves with its numbers; it is not a number of its own. */
const isDate = (change: Change) => change.field === 'checked';

const changedValues = (results: readonly EntryResult[]) =>
	results.flatMap((result) => result.changes.filter((change) => !isDate(change)));

function pad(rows: string[][]): string[] {
	const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
	return rows.map((row) =>
		row
			.map((cell, column) => cell.padEnd(widths[column]))
			.join('  ')
			.trimEnd()
	);
}

export function formatMetricsTable(
	results: readonly EntryResult[],
	options: { all: boolean }
): string {
	const rows: Row[] = results.flatMap((result) =>
		result.rows.filter((row) => options.all || row.status !== 'unchanged')
	);
	if (rows.length === 0) return 'No values to list.';
	return pad([
		['entry', 'value', 'recorded', 'current', 'status'],
		...rows.map((row) => [row.toolId, row.field, show(row.recorded), show(row.current), row.status])
	]).join('\n');
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function formatMetricsSummary(
	results: readonly EntryResult[],
	options: { write: boolean }
): string {
	const failures = results.reduce((sum, result) => sum + result.failures.length, 0);
	return (
		`metrics: ${plural(results.length, 'entry', 'entries')} checked, ` +
		`${plural(changedValues(results).length, 'value', 'values')} changed, ` +
		`${plural(failures, 'failure', 'failures')} ` +
		(options.write ? '(written)' : '(dry run, nothing written)')
	);
}

const cell = (text: string) => text.replace(/\s+/g, ' ').replace(/\|/g, '\\|');

/** The Markdown report of the failures; exactly "No findings." when there are none. */
export function formatFailureReport(results: readonly EntryResult[], date: string): string {
	const failures = results.flatMap((result) => result.failures);
	if (failures.length === 0) return 'No findings.\n';
	return [
		`# Metrics check of ${date}`,
		'',
		'The values below could not be refreshed or looked wrong. The recorded numbers of these values were kept. The other numbers of the run were refreshed.',
		'',
		'| Entry | Value | Kind | Message |',
		'| --- | --- | --- | --- |',
		...failures.map(
			(failure) =>
				`| ${cell(failure.toolId)} | ${cell(failure.field)} | ${failure.kind} | ${cell(failure.message)} |`
		),
		''
	].join('\n');
}

const valueText = (value: ChangeValue | undefined) =>
	value === undefined ? 'none' : typeof value === 'object' ? `${value.tag} (${value.date})` : value;

/** The body of the commit: one line per changed value; empty when nothing changed. */
export function formatCommitBody(results: readonly EntryResult[], date: string): string {
	const lines = changedValues(results).map(
		(change) =>
			`- ${change.toolId}: ${change.field} ${valueText(change.recorded)} -> ${valueText(change.current)}`
	);
	if (lines.length === 0) return '';
	return [
		`Numbers refreshed on ${date} from OpenAlex, GitHub, Zenodo and PyPI.`,
		'',
		...lines,
		''
	].join('\n');
}
