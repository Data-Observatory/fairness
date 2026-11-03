<script lang="ts">
	import { choose, consentState } from '$lib/consent.svelte';
	import type { ConsentChoice } from '$lib/core/consent';
	import * as m from '$lib/paraglide/messages';

	let banner: HTMLElement | undefined = $state();

	// Same classes on both buttons: keeping analytics on and turning it off have the same weight.
	const buttonClass =
		'rounded-full border border-zinc-400 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100';

	function decide(choice: ConsentChoice) {
		// Focus moves to the main content only when it was inside the banner, which is about to go.
		const hadFocus = banner?.contains(document.activeElement) ?? false;
		choose(choice);
		if (hadFocus) document.getElementById('main-content')?.focus({ preventScroll: true });
	}
</script>

{#if consentState.ready && consentState.prompt}
	<section
		bind:this={banner}
		id="consent-banner"
		data-testid="consent-banner"
		aria-labelledby="consent-title"
		tabindex="-1"
		class="border-b border-zinc-200 bg-zinc-50 focus:outline-none print:hidden"
	>
		<div
			class="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
		>
			<div class="text-sm text-zinc-700">
				<p id="consent-title" class="font-medium text-zinc-900">{m.consent_title()}</p>
				<p class="mt-1">{m.consent_text()}</p>
			</div>
			<div class="flex shrink-0 gap-3">
				<button
					type="button"
					data-testid="consent-keep"
					class={buttonClass}
					onclick={() => decide('granted')}
				>
					{m.consent_keep()}
				</button>
				<button
					type="button"
					data-testid="consent-disable"
					class={buttonClass}
					onclick={() => decide('denied')}
				>
					{m.consent_disable()}
				</button>
			</div>
		</div>
	</section>
{/if}
