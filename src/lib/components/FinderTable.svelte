<script lang="ts">
	import { resolve } from '$app/paths';
	import { localized } from '$lib/i18n';
	import type { HomeView } from '$lib/core/view';
	import * as m from '$lib/paraglide/messages';

	let { rows }: { rows: NonNullable<HomeView['finder']> } = $props();
</script>

<section data-testid="finder" class="mt-16" aria-labelledby="finder-title">
	<h2 id="finder-title" class="font-heading text-2xl font-semibold tracking-tight text-zinc-900">
		{m.finder_title()}
	</h2>
	<p class="mt-2 max-w-3xl text-sm text-zinc-700">{m.finder_intro()}</p>
	<table
		data-testid="finder-table"
		class="mt-5 w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-2xl text-left text-sm ring-1 ring-zinc-200"
	>
		<thead class="bg-zinc-50 text-zinc-900">
			<tr>
				<th scope="col" class="w-2/5 px-4 py-3 font-semibold">{m.finder_col_input()}</th>
				<th scope="col" class="px-4 py-3 font-semibold">{m.finder_col_tools()}</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.inputId)}
				<tr data-input={row.inputId}>
					<th scope="row" class="border-t border-zinc-200 px-4 py-3 align-top font-medium">
						<span class="break-words text-zinc-900">{row.inputLabel}</span>
						{#if row.note}
							<span class="mt-1 block font-normal break-words text-zinc-700">{row.note}</span>
						{/if}
					</th>
					<td class="border-t border-zinc-200 px-4 py-3 align-top">
						<ul class="flex flex-wrap gap-x-4 gap-y-1">
							{#each row.tools as tool (tool.id)}
								<li>
									<a
										href={localized(resolve('/tools/[id]', { id: tool.id }))}
										class="break-words text-blue-700 underline decoration-blue-700/40 underline-offset-2 hover:text-blue-900"
									>
										{tool.name}
									</a>
								</li>
							{/each}
						</ul>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</section>
