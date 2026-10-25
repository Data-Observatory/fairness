// Link and freshness report. Requests every URL of the content with HEAD (GET as fallback),
// prints a Markdown report to stdout and writes it to link-report.md. Exit code is 0 even when
// the report has findings; it is non-zero only when the script itself fails.
// Only HEAD and GET requests are made. Nothing is ever submitted to a third-party service.
// Usage: npm run links
//        npm run links -- --only <tool-id>   (only the URLs of content/tools/<tool-id>.yaml)
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent } from '../src/lib/core/content.ts';
import {
	checkLinks,
	collectUrls,
	formatLinkReport,
	staleTools
} from '../src/lib/core/link-check.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const contentDir = join(root, 'content');

function usage(message) {
	if (message) console.error(`links: ${message}`);
	console.error('Usage: npm run links -- [--only <tool-id>]');
	process.exit(2);
}

let only;
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	if (arg === '--only') {
		only = args[index + 1];
		index += 1;
		if (!only || only.startsWith('--')) usage('--only needs a tool id');
	} else if (arg.startsWith('--only=')) {
		only = arg.slice('--only='.length);
		if (!only) usage('--only needs a tool id');
	} else {
		usage(`unknown argument ${arg}`);
	}
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

const loaded = loadContent(files);
let content = loaded;
if (only !== undefined) {
	const tools = loaded.tools.filter((tool) => tool.id === only);
	if (tools.length === 0) {
		usage(`no tool with id "${only}" (expected content/tools/${only}.yaml)`);
	}
	// The site URLs are left out: only the URLs of that tool file are checked.
	content = {
		...loaded,
		site: { ...loaded.site, repository: undefined, contributeUrl: undefined },
		tools
	};
}

const userAgent = `FAIR-Resources-Finder-link-check (+${loaded.site.repository})`;
const today = new Date();
const entries = collectUrls(content);
const results = await checkLinks(
	entries.map((entry) => entry.url),
	{
		fetch,
		concurrency: 4,
		timeoutMs: 15000,
		retries: 2,
		retryDelayMs: 1000,
		userAgent
	}
);

const { markdown } = formatLinkReport({
	results,
	usages: new Map(entries.map((entry) => [entry.url, entry.usages])),
	stale: staleTools(content, today),
	today,
	staleAfterDays: loaded.site.verification.staleAfterDays
});

writeFileSync(join(root, 'link-report.md'), markdown);
process.stdout.write(markdown);
