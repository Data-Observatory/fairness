import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { REPORT_TEMPLATE, buildReportIssueUrl } from './report-link';

// The report link pre-fills fields of the issue form by id, so the form must keep those ids.

const dir = join(process.cwd(), '.github', 'ISSUE_TEMPLATE');
const form = parse(readFileSync(join(dir, REPORT_TEMPLATE), 'utf8')) as {
	name: string;
	description: string;
	labels?: string[];
	body: { type: string; id?: string; attributes?: { options?: string[] }; validations?: unknown }[];
};

const field = (id: string) => form.body.find((item) => item.id === id);

describe('issue form for tool reports', () => {
	it('is the file named by REPORT_TEMPLATE', () => {
		expect(REPORT_TEMPLATE).toBe('report-tool.yml');
	});

	it('has the fields that buildReportIssueUrl pre-fills', () => {
		const link = new URL(
			buildReportIssueUrl('https://example.org/repo', {
				id: 'a',
				name: 'A',
				url: 'https://example.org/a'
			})
		);
		const prefilled = [...link.searchParams.keys()].filter(
			(key) => key !== 'template' && key !== 'title'
		);
		expect(prefilled).toEqual(['tool', 'url']);
		for (const id of prefilled) expect(field(id), id).toBeDefined();
	});

	it('has a problem dropdown and a details field', () => {
		expect(field('problem')?.type).toBe('dropdown');
		expect(field('problem')?.attributes?.options).toEqual([
			'Broken link',
			'Changed behavior',
			'Incorrect fact',
			'Other'
		]);
		expect(field('details')?.type).toBe('textarea');
	});

	it('uses unique field ids and the tool-report label', () => {
		const ids = form.body.flatMap((item) => (item.id === undefined ? [] : [item.id]));
		expect(new Set(ids).size).toBe(ids.length);
		expect(form.labels).toEqual(['tool-report']);
		expect(form.name.length).toBeGreaterThan(0);
		expect(form.description.length).toBeGreaterThan(0);
	});
});
