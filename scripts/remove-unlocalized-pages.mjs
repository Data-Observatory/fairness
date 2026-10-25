// Every locale is prefixed (/en, /es): there is no unprefixed English experience.
// SvelteKit still prerenders each static route (about, tools/[id]) at its own canonical,
// unprefixed path regardless of the reroute/locale layer. Those bare files render
// identical content to their /en/* counterpart (getLocale() falls back to the base
// locale with no prefix present): pure duplicates, never linked from anywhere in the
// app. Delete them so only /en, /es, and the root redirect stub ship.
// The same applies to the tools/ directory (detail pages come from the route's entries()).
import { readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// BUILD_DIR (absolute) is set by scripts/check-base-path.mjs. The adapter writes the pages
// without the base path as a directory prefix, so the same names apply under any BASE_PATH.
const buildDir = process.env.BUILD_DIR
	? pathToFileURL(`${resolve(process.env.BUILD_DIR)}/`)
	: new URL('../build/', import.meta.url);

const paths = ['about.html', 'tools'];

for (const path of paths) {
	const target = new URL(path, buildDir);
	if (existsSync(target)) {
		await rm(target, { recursive: true, force: true });
		console.log(`removed unlocalized build/${path}`);
	}
}

// static/404.html uses relative links. Set the document base to the deploy base path so they
// resolve to /<base>/en and /<base>/es whatever the missing URL was.
const notFound = new URL('404.html', buildDir);
if (existsSync(notFound)) {
	const base = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
	const html = await readFile(notFound, 'utf8');
	if (!/<base\s/i.test(html)) {
		const withBase = html.replace(/<head>/i, `<head>\n\t\t<base href="${base}/" />`);
		await writeFile(notFound, withBase);
		console.log(`set <base href="${base}/"> in build/404.html`);
	}
}
