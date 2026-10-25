<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	let { caveats, headingLevel = 2 }: { caveats: string[]; headingLevel?: 2 | 3 } = $props();
</script>

<div
	data-testid="caveats"
	class="mx-auto max-w-3xl rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-800 ring-1 ring-zinc-200"
>
	<svelte:element
		this={`h${headingLevel}`}
		class="font-heading text-base font-semibold text-zinc-900"
	>
		{m.caveats_title()}
	</svelte:element>
	<ul class="mt-3 list-disc space-y-2 pl-5">
		{#each caveats as caveat (caveat)}
			<li class="break-words">{caveat}</li>
		{/each}
	</ul>
</div>
