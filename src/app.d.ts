// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	/** Build date (YYYY-MM-DD), substituted at build time: see vite.config.ts `define`. */
	const __BUILD_DATE__: string;
}

export {};
