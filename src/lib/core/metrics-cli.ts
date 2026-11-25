// Arguments of `npm run metrics`. Kept apart from the script so they can be tested.

export class UsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'UsageError';
	}
}

export type MetricsArgs = { write: boolean; all: boolean; only: string | undefined };

export function parseMetricsArgs(argv: readonly string[]): MetricsArgs {
	const args: MetricsArgs = { write: false, all: false, only: undefined };
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		if (arg === '--write') args.write = true;
		else if (arg === '--all') args.all = true;
		else if (arg === '--only') {
			const value = argv[index + 1];
			if (value === undefined || value === '' || value.startsWith('--')) {
				throw new UsageError('--only needs a tool id');
			}
			args.only = value;
			index += 1;
		} else if (arg.startsWith('--only=')) {
			args.only = arg.slice('--only='.length);
			if (args.only === '') throw new UsageError('--only needs a tool id');
		} else throw new UsageError(`unknown argument ${arg}`);
	}
	return args;
}
