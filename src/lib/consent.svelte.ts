import {
	clearConsent,
	needsPrompt,
	readConsent,
	writeConsent,
	type ConsentChoice
} from '$lib/core/consent';

/** What static/consent-loader.js exposes on window. Missing when that script did not run. */
type ConsentLoader = { grant(): void; deny(): void; revoke(): void; isLoaded(): boolean };

/**
 * `ready` becomes true after mount: the banner and the change controls exist only in the browser,
 * so the prerendered HTML (and the page without JavaScript) has neither. `prompt` is true while
 * the visitor has to be asked.
 */
export const consentState = $state({ ready: false, prompt: false });

const loader = (): ConsentLoader | undefined =>
	(window as unknown as { fairConsent?: ConsentLoader }).fairConsent;

// A point in time that is read once per call, not reactive state.
const now = () => new Date();

// Reading `window.localStorage` itself can throw (blocked site data), hence the guard.
function storage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/** Decides from the stored choice whether to ask. Call once after mount. */
export function initConsent(): void {
	consentState.prompt = needsPrompt(readConsent(storage()), now());
	consentState.ready = true;
}

/** Records the choice (the loader also loads or stops the tag) and hides the banner. */
export function choose(choice: ConsentChoice): void {
	const api = loader();
	if (api) {
		if (choice === 'granted') api.grant();
		else api.deny();
	} else {
		writeConsent(storage(), choice, now());
	}
	consentState.prompt = false;
}

/**
 * Forgets the stored choice and asks again. When the tag was loaded in this page view the page
 * reloads, so the tag stops; the banner then shows after the reload.
 */
export function changeChoice(): void {
	const api = loader();
	const tagLoaded = api?.isLoaded() ?? false;
	if (api) api.revoke();
	else clearConsent(storage());
	if (tagLoaded) {
		window.location.reload();
		return;
	}
	consentState.prompt = true;
}
