// Every locale is prefixed (/en, /es): there is no unprefixed English experience.
// SvelteKit still prerenders each static route (about, tools/[id]) at its own canonical,
// unprefixed path regardless of the reroute/locale layer. Those bare files render
// identical content to their /en/* counterpart (getLocale() falls back to the base
// locale with no prefix present): pure duplicates, never linked from anywhere in the
// app. Delete them so only /en, /es, and the root redirect stub ship.
// The same applies to the tools/ directory (detail pages come from the route's entries()).
import { rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const buildDir = new URL('../build/', import.meta.url);

const paths = ['about.html', 'tools'];

for (const path of paths) {
	const target = new URL(path, buildDir);
	if (existsSync(target)) {
		await rm(target, { recursive: true, force: true });
		console.log(`removed unlocalized build/${path}`);
	}
}
