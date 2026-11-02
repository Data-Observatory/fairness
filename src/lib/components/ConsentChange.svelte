<script lang="ts">
	import { tick } from 'svelte';
	import { changeChoice } from '$lib/consent.svelte';
	import * as m from '$lib/paraglide/messages';

	let { class: className = '' }: { class?: string } = $props();

	async function change() {
		changeChoice();
		// The visitor asked for the question, so the banner (when shown) receives focus.
		await tick();
		document.getElementById('consent-banner')?.focus();
	}
</script>

<button type="button" data-testid="consent-change" class={className} onclick={change}>
	{m.consent_change()}
</button>
