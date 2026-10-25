import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

// Load the CloudFront Function source exactly as deployed and evaluate it in plain JS.
const source = fs.readFileSync(path.join(__dirname, '../cloudfront-fn/rewrite-uri.js'), 'utf8');
const handler = new Function(`${source}\nreturn handler;`)() as (event: {
	request: { uri: string; headers?: Record<string, unknown> };
}) => { uri: string };

function rewrite(uri: string): string {
	return handler({ request: { uri, headers: {} } }).uri;
}

describe('rewrite-uri.js CloudFront Function', () => {
	it.each([
		['/en', '/en.html'],
		['/es', '/es.html'],
		['/en/about', '/en/about.html'],
		['/en/tools/f-uji', '/en/tools/f-uji.html'],
		['/en/', '/en.html'],
		['/', '/index.html'],
		['/favicon.svg', '/favicon.svg'],
		['/_app/immutable/x.js', '/_app/immutable/x.js'],
		['/en/about.html', '/en/about.html'],
		['/404.html', '/404.html'],
		['/robots.txt', '/robots.txt']
	])('maps %s to %s', (input, expected) => {
		expect(rewrite(input)).toBe(expected);
	});

	it('returns the request object (not a response) so CloudFront forwards it to the origin', () => {
		const request = { uri: '/en', headers: { host: { value: 'fair.example.test' } } };
		const result = handler({ request }) as unknown as typeof request;
		expect(result.headers.host.value).toBe('fair.example.test');
		expect(result.uri).toBe('/en.html');
	});

	it('only emits URIs that exist in the static build for the documented routes', () => {
		const build = path.join(__dirname, '../../build');
		for (const route of ['/', '/en', '/es', '/en/about', '/es/about', '/en/tools/f-uji']) {
			const target = rewrite(route);
			expect(fs.existsSync(path.join(build, target)), `${route} -> ${target}`).toBe(true);
		}
	});
});
