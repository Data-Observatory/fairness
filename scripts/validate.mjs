// Loads the real content/ directory, validates it (schema, cross-checks) and runs the style
// lint over content and UI messages. Prints every issue with file and path; exit code 1 on issues.
// Content problems do not stop the messages from being linted: both groups are reported.
// Runs before every build (npm "prebuild"). Until content/ is authored (milestone M3) it fails.
// Usage: npm run validate
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProject } from '../src/lib/core/validate.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const contentDir = join(root, 'content');
const messagesDir = join(root, 'messages');

function walk(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

// Every file under content/ is passed on, so misnamed files are reported. The generated
// editor schema is the only allowed non-YAML file.
const files = {};
if (existsSync(contentDir)) {
	for (const full of walk(contentDir)) {
		const name = relative(root, full).split(sep).join('/');
		if (name !== 'content/tool.schema.json') files[name] = readFileSync(full, 'utf8');
	}
}

if (Object.keys(files).length === 0) {
	console.error('validate: content/ has no files (expected content/site.yaml and the others).');
	console.error(
		'The content files are authored in milestone M3; this failure is expected until then.'
	);
}

const messages = {};
if (existsSync(messagesDir)) {
	for (const name of readdirSync(messagesDir)) {
		if (name.endsWith('.json')) {
			messages[name.slice(0, -'.json'.length)] = JSON.parse(
				readFileSync(join(messagesDir, name), 'utf8')
			);
		}
	}
}

const { problems, toolCount } = validateProject(files, messages);
for (const { file, path, message } of problems) {
	console.error(`${file}: ${path || '(root)'}: ${message}`);
}

if (problems.length > 0) {
	console.error(`validate: failed (${problems.length} problem(s))`);
	process.exit(1);
}
console.log(`validate: ok (${toolCount} tools)`);
