import { describe, expect, it } from 'vitest';
import { buildReportIssueUrl } from './report-link';

const REPO = 'https://github.com/example-org/example-repo';
const tool = { id: 'f-uji', name: 'F-UJI', url: 'https://example.org/f-uji' };

const paramsOf = (link: string) => new URL(link).searchParams;

describe('buildReportIssueUrl', () => {
	it('builds the new issue URL with the template, title, tool id and tool URL', () => {
		expect(buildReportIssueUrl(REPO, tool)).toBe(
			`${REPO}/issues/new?template=report-tool.yml&title=Report%3A%20F-UJI&tool=f-uji&url=https%3A%2F%2Fexample.org%2Ff-uji`
		);
	});

	it('keeps the parameter order template, title, tool, url', () => {
		const names = [...paramsOf(buildReportIssueUrl(REPO, tool)).keys()];
		expect(names).toEqual(['template', 'title', 'tool', 'url']);
	});

	it('removes trailing slashes from the repository URL', () => {
		expect(buildReportIssueUrl(`${REPO}/`, tool)).toBe(buildReportIssueUrl(REPO, tool));
		expect(buildReportIssueUrl(`${REPO}//`, tool)).toBe(buildReportIssueUrl(REPO, tool));
	});

	it('encodes spaces as %20, not as a plus sign or a raw space', () => {
		const link = buildReportIssueUrl(REPO, { ...tool, name: 'FAIR Data Self Assessment' });
		expect(link).toContain('title=Report%3A%20FAIR%20Data%20Self%20Assessment&');
		expect(link).not.toContain(' ');
		expect(link).not.toContain('+');
	});

	it('encodes an ampersand in the name so it does not split the query', () => {
		const link = buildReportIssueUrl(REPO, { ...tool, name: 'Data & Software Check' });
		expect(link).toContain('title=Report%3A%20Data%20%26%20Software%20Check&');
		expect(paramsOf(link).get('title')).toBe('Report: Data & Software Check');
		expect([...paramsOf(link).keys()]).toEqual(['template', 'title', 'tool', 'url']);
	});

	it('encodes a hash in the name so it does not start a fragment', () => {
		const link = buildReportIssueUrl(REPO, { ...tool, name: 'Check #1' });
		expect(link).toContain('title=Report%3A%20Check%20%231&');
		expect(new URL(link).hash).toBe('');
		expect(paramsOf(link).get('title')).toBe('Report: Check #1');
	});

	it('encodes non-ASCII characters as UTF-8 percent escapes', () => {
		const link = buildReportIssueUrl(REPO, { ...tool, name: 'Evaluación FAIR ñ' });
		expect(link).toContain('title=Report%3A%20Evaluaci%C3%B3n%20FAIR%20%C3%B1&');
		expect(paramsOf(link).get('title')).toBe('Report: Evaluación FAIR ñ');
	});

	it('encodes the tool URL with its own query, ampersands and hash', () => {
		const url = 'https://example.org/tool?a=1&b=two words#section';
		const link = buildReportIssueUrl(REPO, { ...tool, url });
		expect(link).toContain(
			'&url=https%3A%2F%2Fexample.org%2Ftool%3Fa%3D1%26b%3Dtwo%20words%23section'
		);
		expect(paramsOf(link).get('url')).toBe(url);
		expect(new URL(link).hash).toBe('');
	});

	it('encodes a non-ASCII tool URL', () => {
		const url = 'https://example.org/evaluación?q=ñ';
		expect(paramsOf(buildReportIssueUrl(REPO, { ...tool, url })).get('url')).toBe(url);
	});

	it('round trips every value through URL parsing', () => {
		const odd = {
			id: 'odd-tool',
			name: 'A&B #2 ñ "x" 100%',
			url: 'https://example.org/a?b=c&d=e#f'
		};
		const params = paramsOf(buildReportIssueUrl(REPO, odd));
		expect(params.get('template')).toBe('report-tool.yml');
		expect(params.get('title')).toBe(`Report: ${odd.name}`);
		expect(params.get('tool')).toBe(odd.id);
		expect(params.get('url')).toBe(odd.url);
	});
});
