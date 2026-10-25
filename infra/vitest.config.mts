import { defineConfig } from 'vitest/config';

// Standalone config so vitest does not pick up the SvelteKit vite.config.ts one level up.
export default defineConfig({
	test: {
		include: ['test/**/*.test.ts'],
		environment: 'node'
	}
});
