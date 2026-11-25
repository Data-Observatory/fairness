// Refreshes the recorded citation, GitHub and download numbers (the `metrics` block of the entries
// in content/tools/) from OpenAlex, the GitHub API, Zenodo and pypistats.
// Default is a dry run: it prints what would change and what failed, and writes nothing.
// With --write it rewrites only the numbers and dates of the metrics blocks, after the whole
// content has been validated again. Exit code is 0 even when there are findings; it is non-zero
// only when the script itself fails. Only GET requests are made. Nothing is submitted anywhere.
// A token in GITHUB_TOKEN or GH_TOKEN (or none) is used for api.github.com only.
// Writes metrics-report.md (the failures; "No findings." when clean) and metrics-commit.md (the
// body of the commit the scheduled job makes; empty when nothing changed). Both are git-ignored.
// Usage: npm run metrics
//        npm run metrics -- --write
//        npm run metrics -- --all                (also list the unchanged values)
//        npm run metrics -- --only <tool-id>
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../src/lib/core/content.ts';
import { localIsoDate } from '../src/lib/core/freshness.ts';
import { UsageError, parseMetricsArgs } from '../src/lib/core/metrics-cli.ts';
import { applyMetricChanges } from '../src/lib/core/metrics-edit.ts';
import { refreshEntry } from '../src/lib/core/metrics-refresh.ts';
import {
	formatCommitBody,
	formatFailureReport,
	formatMetricsSummary,
	formatMetricsTable
} from '../src/lib/core/metrics-report.ts';
import { createSources } from '../src/lib/core/metrics-sources.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const contentDir = join(root, 'content');

let args;
try {
	args = parseMetricsArgs(process.argv.slice(2));
} catch (error) {
	if (!(error instanceof UsageError)) throw error;
	console.error(`metrics: ${error.message}`);
	console.error('Usage: npm run metrics -- [--write] [--all] [--only <tool-id>]');
	process.exit(2);
}

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

const files = {};
if (existsSync(contentDir)) {
	for (const full of walk(contentDir)) {
		const name = relative(root, full).split(sep).join('/');
		if (name !== 'content/tool.schema.json') files[name] = readFileSync(full, 'utf8');
	}
}

const content = loadContent(files);
let tools = content.tools.filter((tool) => tool.metrics !== undefined);
if (args.only !== undefined) {
	tools = tools.filter((tool) => tool.id === args.only);
	if (tools.length === 0) {
		console.error(`metrics: no entry "${args.only}" with a metrics block`);
		process.exit(2);
	}
}

const sources = createSources({
	fetch,
	userAgent: `FAIR-Resources-Finder-metrics (+${content.site.repository})`,
	timeoutMs: 20000,
	retries: 2,
	retryDelayMs: 2000,
	githubToken: process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined
});

const today = localIsoDate(new Date());

// A few entries at a time; the order of the results is the order of the entries.
const results = new Array(tools.length);
let next = 0;
async function worker() {
	while (next < tools.length) {
		const index = next;
		next += 1;
		const tool = tools[index];
		results[index] = await refreshEntry(
			{ id: tool.id, source_code: tool.source_code, metrics: tool.metrics },
			sources,
			today
		);
	}
}
await Promise.all(Array.from({ length: Math.min(4, tools.length) }, worker));

console.log(formatMetricsTable(results, { all: args.all }));
console.log('');

if (args.write) {
	const edited = {};
	for (const result of results) {
		if (result.changes.length === 0) continue;
		const name = `content/tools/${result.toolId}.yaml`;
		edited[name] = applyMetricChanges(files[name], result.changes);
	}
	// The whole content must still be valid before anything is written.
	loadContent({ ...files, ...edited });
	for (const [name, text] of Object.entries(edited)) writeFileSync(join(root, name), text);
}

writeFileSync(join(root, 'metrics-report.md'), formatFailureReport(results, today));
writeFileSync(join(root, 'metrics-commit.md'), formatCommitBody(results, today));
for (const result of results) {
	for (const failure of result.failures) {
		console.log(
			`failure: ${failure.toolId}: ${failure.field}: ${failure.kind}: ${failure.message}`
		);
	}
}
console.log(formatMetricsSummary(results, { write: args.write }));
