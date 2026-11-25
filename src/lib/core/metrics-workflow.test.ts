import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

// The scheduled metrics refresh. These checks read the workflow file as text and data: nothing
// is run. They keep the cron, the permissions and the order of the steps from drifting.

const path = fileURLToPath(new URL('../../../.github/workflows/metrics.yml', import.meta.url));
const text = readFileSync(path, 'utf8');
const workflow = parse(text);
const job = Object.values(workflow.jobs)[0] as {
	permissions?: Record<string, string>;
	steps: { name?: string; uses?: string; run?: string; env?: Record<string, string> }[];
};
const runs = job.steps.map((step) => step.run ?? '');
const indexOfRun = (needle: string) => runs.findIndex((run) => run.includes(needle));

describe('metrics workflow', () => {
	it('runs weekly on Mondays after the link check, and on demand', () => {
		expect(workflow.on.schedule).toEqual([{ cron: '0 7 * * 1' }]);
		expect(workflow.on).toHaveProperty('workflow_dispatch');
		const links = parse(readFileSync(path.replace('metrics.yml', 'links.yml'), 'utf8'));
		expect(links.on.schedule[0].cron).toBe('0 6 * * 1');
	});

	it('may write the repository and issues, and nothing else', () => {
		const permissions = workflow.permissions ?? job.permissions;
		expect(permissions).toEqual({ contents: 'write', issues: 'write' });
	});

	it('runs one at a time and never cancels a run in progress', () => {
		expect(workflow.concurrency.group).toBeTruthy();
		expect(workflow.concurrency['cancel-in-progress']).toBe(false);
	});

	it('pins every action to a commit SHA', () => {
		const used = job.steps.flatMap((step) => (step.uses ? [step.uses] : []));
		expect(used.length).toBeGreaterThan(0);
		for (const use of used) expect(use, use).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}( #.*)?$/);
	});

	it('uses Node 22 and installs from the lockfile', () => {
		expect(text).toMatch(/node-version: 22\.x/);
		expect(indexOfRun('npm ci')).toBeGreaterThanOrEqual(0);
	});

	it('refreshes with --write, then validates and runs the unit tests before it commits', () => {
		const refresh = indexOfRun('npm run metrics -- --write');
		const validate = indexOfRun('npm run validate');
		const unit = indexOfRun('npx vitest run');
		const commit = runs.findIndex((run) => /git commit/.test(run));
		expect(refresh).toBeGreaterThanOrEqual(0);
		expect(validate).toBeGreaterThan(refresh);
		expect(unit).toBeGreaterThan(refresh);
		expect(commit).toBeGreaterThan(validate);
		expect(commit).toBeGreaterThan(unit);
	});

	it('commits as github-actions[bot] with the agreed message and no attribution trailer', () => {
		expect(text).toContain('github-actions[bot]');
		expect(text).toContain('chore(metrics): refresh citation, GitHub and download numbers');
		expect(text).not.toMatch(/co-authored-by/i);
		expect(text).not.toMatch(/generated with/i);
	});

	it('pushes to main only when the tree changed', () => {
		const commitStep = runs.find((run) => /git commit/.test(run)) ?? '';
		expect(commitStep).toMatch(/git (status --porcelain|diff --quiet)/);
		expect(commitStep).toMatch(/git push origin HEAD:main/);
	});

	it('reports failures in an issue labeled metrics-check, created or updated like the link check', () => {
		expect(text).toContain('metrics-check');
		expect(text).toContain('metrics-report.md');
		expect(text).toMatch(/gh issue (create|edit|comment)/);
		// The shell test escapes the dot for grep: grep -qx 'No findings\.'
		expect(text).toMatch(/No findings\\?\./);
	});

	it('says that a push with GITHUB_TOKEN triggers no CI and that the live site waits for a deploy', () => {
		const header = text
			.split('\n')
			.filter((line) => line.startsWith('#'))
			.map((line) => line.replace(/^#\s?/, ''))
			.join(' ');
		expect(header).toMatch(/GITHUB_TOKEN/);
		expect(header).toMatch(/does not trigger/i);
		expect(header).toMatch(/next deploy/i);
	});

	it('stores no account id, ARN, secret or email address', () => {
		expect(text).not.toMatch(/\b\d{12}\b/);
		expect(text).not.toMatch(/arn:aws/i);
		expect(text).not.toMatch(/secrets\.(?!GITHUB_TOKEN)/);
		expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
	});

	it('uses no em dash or en dash', () => {
		expect(text).not.toMatch(/[–—]/);
	});
});
