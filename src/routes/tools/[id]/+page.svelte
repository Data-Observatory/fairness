<script lang="ts">
	import { resolve } from '$app/paths';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import { localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
	const tool = $derived(data.tool);
</script>

<svelte:head>
	<title>{tool.name} - {m.site_name()}</title>
</svelte:head>

<!-- Bare placeholder: the detail page layout is completed in a later step. -->
<div class="mx-auto max-w-3xl px-6 py-12">
	<h1 class="font-heading text-3xl font-semibold text-zinc-900">{tool.name}</h1>
	<p class="mt-3 text-zinc-700">{tool.summary}</p>
	<dl
		data-testid="tool-facts"
		class="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]"
	>
		{#each tool.facts as fact (fact.key)}
			<dt class="font-medium text-zinc-900">{fact.label}</dt>
			<dd class="text-zinc-700">{fact.items.map((item) => item.text).join(', ')}</dd>
		{/each}
	</dl>
	<p data-testid="last-verified" class="mt-4 text-sm text-zinc-700">{tool.lastVerified}</p>
	<p class="mt-6 flex items-center gap-4">
		<ExternalLink
			href={tool.url}
			data-testid="open-tool"
			class="inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
		>
			{m.card_open()}
		</ExternalLink>
		<span class="text-sm text-zinc-700">{tool.host}</span>
	</p>
	<p class="mt-6">
		<a href={localized(resolve('/'))} class="text-sm text-blue-700 underline underline-offset-2">
			{m.nav_home()}
		</a>
	</p>
</div>
