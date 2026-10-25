import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';

const infraRoot = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'cdk.out']);
const SKIP_FILES = new Set(['package-lock.json']);
// The dummy account used by the synth tests is the only 12-digit id allowed.
const DUMMY_ACCOUNT = '111111111111';

function listFiles(dir: string): string[] {
	const out: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (!SKIP_DIRS.has(entry.name)) out.push(...listFiles(path.join(dir, entry.name)));
		} else if (!SKIP_FILES.has(entry.name)) {
			out.push(path.join(dir, entry.name));
		}
	}
	return out;
}

describe('infra contains no real account identifiers', () => {
	const files = listFiles(infraRoot);

	it('scans a non-empty set of files', () => {
		expect(files.length).toBeGreaterThan(5);
	});

	it('has no 12-digit AWS account id', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const text = fs.readFileSync(file, 'utf8');
			for (const match of text.matchAll(/(?<![0-9])[0-9]{12}(?![0-9])/g)) {
				if (match[0] !== DUMMY_ACCOUNT)
					offenders.push(`${path.relative(infraRoot, file)}: ${match[0]}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('has no arn:aws string that embeds an account id', () => {
		const offenders: string[] = [];
		for (const file of files) {
			const text = fs.readFileSync(file, 'utf8');
			for (const match of text.matchAll(
				/arn:aws[a-z-]*:[a-z0-9-]*:[a-z0-9-]*:[0-9]{12}:[^\s'"`]*/g
			)) {
				offenders.push(`${path.relative(infraRoot, file)}: ${match[0]}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
