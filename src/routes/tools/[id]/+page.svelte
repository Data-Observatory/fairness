<script lang="ts">
	import { resolve } from '$app/paths';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import { FACT_LABELS } from '$lib/core/labels';
	import type { FactItem } from '$lib/core/view';
	import { localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let { data } = $props();
	const tool = $derived(data.tool);

	const statusChip = $derived(tool.chips.find((chip) => chip.kind === 'status'));
	const plainChips = $derived(tool.chips.filter((chip) => chip.kind !== 'status'));
	const labels = $derived(FACT_LABELS[getLocale()]);

	const linkClass = 'text-blue-700 underline underline-offset-2 break-words hover:text-blue-800';
	const isExternal = (item: FactItem) => item.href !== undefined && /^https?:\/\//.test(item.href);
</script>

<svelte:head>
	<title>{tool.name} - {data.site.name}</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-6 pt-4 pb-8">
	<p class="print:hidden">
		<a href={localized(resolve('/'))} class="text-sm text-blue-700 underline underline-offset-2">
			<span aria-hidden="true">&larr;</span>
			{m.detail_back()}
		</a>
	</p>

	<h1 class="mt-6 font-heading text-3xl font-semibold tracking-tight break-words text-zinc-900">
		{tool.name}
	</h1>

	<ul class="mt-4 flex flex-wrap gap-1.5">
		{#each plainChips as chip (`${chip.kind}-${chip.id}`)}
			<li
				data-chip={chip.kind}
				class="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-800"
			>
				{chip.label}
			</li>
		{/each}
		{#if statusChip}
			<li><StatusChip chip={statusChip} /></li>
		{/if}
	</ul>

	<p class="mt-4 text-zinc-700">{tool.summary}</p>

	{#if tool.bestFor}
		<p data-testid="best-for" class="mt-3 text-zinc-700">
			<span class="font-medium text-zinc-900">{m.card_use_case()}</span>
			{tool.bestFor}
		</p>
	{/if}

	<p class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
		<ExternalLink
			href={tool.url}
			data-testid="open-tool"
			class="inline-flex items-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
		>
			{m.card_open()}<span class="sr-only">: {tool.name}</span>
		</ExternalLink>
		<span class="text-sm break-all text-zinc-700">{tool.url}</span>
	</p>

	{#if tool.statusNote}
		<div
			data-testid="status-note"
			class="mt-6 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-800 ring-1 ring-zinc-200 print:break-inside-avoid"
		>
			<h2 class="font-heading text-base font-semibold text-zinc-900">
				{m.detail_status_note_title()}
			</h2>
			<p class="mt-1 break-words">{tool.statusNote}</p>
		</div>
	{/if}

	<h2 class="mt-10 font-heading text-xl font-semibold text-zinc-900">{m.detail_facts_title()}</h2>
	<dl
		data-testid="tool-facts"
		class="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr] sm:gap-y-3"
	>
		{#each tool.facts as fact (fact.key)}
			<dt class="mt-3 font-medium text-zinc-900 sm:mt-0">{fact.label}</dt>
			<dd class="break-words text-zinc-700">
				{#each fact.items as item, index (index)}
					{#if index > 0},
					{/if}
					{#if item.href && isExternal(item)}
						<ExternalLink href={item.href} class={linkClass}>{item.text}</ExternalLink>
					{:else if item.href}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- fact link from content -->
						<a href={item.href} class={linkClass}>{item.text}</a>
					{:else}
						{item.text}
					{/if}
				{/each}
			</dd>
		{/each}
		{#if tool.api}
			<dt class="mt-3 font-medium text-zinc-900 sm:mt-0">{labels.api}</dt>
			<dd class="break-words text-zinc-700">
				{#if tool.api.available && tool.api.url}
					<ExternalLink href={tool.api.url} class={linkClass}>
						{m.detail_api_available()}
					</ExternalLink>
				{:else if tool.api.available}
					{m.detail_api_available()}
				{:else}
					{m.detail_api_unavailable()}
				{/if}
			</dd>
		{/if}
		{#if tool.selfHostable !== undefined}
			<dt class="mt-3 font-medium text-zinc-900 sm:mt-0">{labels.self_hostable}</dt>
			<dd class="text-zinc-700">{tool.selfHostable ? m.detail_yes() : m.detail_no()}</dd>
		{/if}
	</dl>

	<p data-testid="last-verified" class="mt-6 text-sm text-zinc-700">
		<span class="font-medium text-zinc-900">{m.detail_last_verified()}</span>
		<time datetime={tool.lastVerified}>{tool.lastVerified}</time>
	</p>
	{#if tool.stale}
		<p data-testid="stale-note" class="mt-1 text-sm text-zinc-700">
			{m.detail_stale({ days: tool.daysSinceVerified })}
		</p>
	{/if}

	{#if tool.references.length > 0}
		<h2 class="mt-10 font-heading text-xl font-semibold text-zinc-900">
			{m.detail_references_title()}
		</h2>
		<ul class="mt-4 space-y-3 text-sm">
			{#each tool.references as reference (reference.url)}
				<li class="break-words">
					<ExternalLink href={reference.url} class={linkClass}>{reference.title}</ExternalLink>
					<span class="block text-zinc-700">{reference.host}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
