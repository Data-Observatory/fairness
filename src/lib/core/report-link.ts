import type { Tool } from './schema.ts';

/** Name of the issue form in `.github/ISSUE_TEMPLATE/` that receives the report. */
export const REPORT_TEMPLATE = 'report-tool.yml';

/**
 * Link to the "new issue" page of `repository` with the report form open and the `tool` and
 * `url` fields (and the title) pre-filled. Values are percent-encoded with encodeURIComponent,
 * so spaces, `&`, `#` and non-ASCII characters cannot alter the query.
 */
export function buildReportIssueUrl(
	repository: string,
	tool: Pick<Tool, 'id' | 'name' | 'url'>
): string {
	const base = repository.replace(/\/+$/, '');
	const query = [
		['template', REPORT_TEMPLATE],
		['title', `Report: ${tool.name}`],
		['tool', tool.id],
		['url', tool.url]
	]
		.map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
		.join('&');
	return `${base}/issues/new?${query}`;
}
