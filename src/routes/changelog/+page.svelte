<script lang="ts">
	import { resolve } from '$app/paths';
	import { localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
</script>

<svelte:head>
	<title>{m.changelog_title()} - {data.site.name}</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-6 pt-4 pb-8 text-zinc-700">
	<h1 class="font-heading text-3xl font-semibold tracking-tight text-zinc-900">
		{m.changelog_title()}
	</h1>
	<p class="mt-3">{m.changelog_intro()}</p>

	{#each data.days as day (day.date)}
		<section data-testid="changelog-day" data-date={day.date} aria-labelledby={`day-${day.date}`}>
			<h2 id={`day-${day.date}`} class="mt-10 font-heading text-xl font-semibold text-zinc-900">
				<time datetime={day.date}>{day.date}</time>
			</h2>
			<ul class="mt-3 space-y-4">
				{#each day.entries as entry, index (index)}
					<li data-testid="changelog-entry">
						<p data-testid="changelog-text">{entry.text}</p>
						{#if entry.tools.length > 0}
							<p class="mt-1 text-sm">
								{m.changelog_entries()}
								{#each entry.tools as tool, toolIndex (tool.id)}
									<a
										href={localized(resolve('/tools/[id]', { id: tool.id }))}
										data-tool-id={tool.id}
										class="text-blue-700 underline underline-offset-2 hover:text-blue-800"
										>{tool.name}</a
									>{toolIndex < entry.tools.length - 1 ? ', ' : ''}
								{/each}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
