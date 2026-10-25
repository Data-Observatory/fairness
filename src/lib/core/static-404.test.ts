import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// static/404.html is served as is, with no build step, from any base path and for any locale.

const html = readFileSync(join(process.cwd(), 'static', '404.html'), 'utf8');

describe('static/404.html', () => {
	it('has no absolute href="/" (it breaks under a BASE_PATH)', () => {
		expect(html).not.toMatch(/href\s*=\s*["']\/["']/i);
	});

	it('contains an English message', () => {
		expect(html).toMatch(/Page not found/i);
	});

	it('contains a Spanish message', () => {
		expect(html).toMatch(/Página no encontrada|no se encontró|no existe/i);
		expect(html).toMatch(/lang="es"|lang='es'|Buscador de recursos FAIR/);
	});

	it('does not use em or en dashes', () => {
		expect(html).not.toMatch(
			new RegExp(`[${String.fromCharCode(0x2013)}${String.fromCharCode(0x2014)}]`)
		);
	});
});
