<script lang="ts">
	import { resolve } from '$app/paths';
	import ExternalLink from '$lib/components/ExternalLink.svelte';
	import StatusChip from '$lib/components/StatusChip.svelte';
	import type { CompareView } from '$lib/core/compare-state';
	import { localized } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	let { view }: { view: CompareView } = $props();

	const linkClass = 'text-blue-700 underline underline-offset-2 break-words hover:text-blue-800';
	const isExternal = (href: string) => /^https?:\/\//.test(href);
</script>

<!-- A scrollable region must be reachable by keyboard so its content can be scrolled without a pointer. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	data-testid="compare-scroll"
	role="region"
	tabindex="0"
	aria-label={m.compare_table_region()}
	class="relative mt-4 overflow-x-auto rounded-2xl ring-1 ring-zinc-200"
>
	<table
		data-testid="compare-table"
		class="w-full min-w-[36rem] table-fixed border-separate border-spacing-0 text-left text-sm"
	>
		<caption class="px-4 py-3 text-left text-sm text-zinc-700">
			{m.compare_table_caption()}
		</caption>
		<thead class="bg-zinc-50 text-zinc-900">
			<tr>
				<td class="w-1/4 px-4 py-3"></td>
				{#each view.columns as column (column.id)}
					<th scope="col" data-tool-id={column.id} class="px-4 py-3 align-top font-semibold">
						<a
							href={localized(resolve('/tools/[id]', { id: column.id }))}
							class="font-heading break-words text-blue-700 underline underline-offset-2 hover:text-blue-800"
						>
							{column.name}
						</a>
						<span class="mt-2 block font-normal">
							<StatusChip chip={{ kind: 'status', ...column.status }} />
						</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each view.rows as row (row.key)}
				<tr data-fact={row.key}>
					<th
						scope="row"
						class="border-t border-zinc-200 px-4 py-3 text-left align-top font-medium text-zinc-900"
					>
						{row.label}
					</th>
					{#each row.cells as cell (cell.toolId)}
						<td
							data-tool-id={cell.toolId}
							data-missing={cell.missing ? '' : undefined}
							class="border-t border-zinc-200 px-4 py-3 align-top break-words text-zinc-700"
						>
							{#if cell.missing}
								{m.compare_not_recorded()}
							{:else}
								{#each cell.items as item, index (index)}
									{#if index > 0},
									{/if}
									{#if item.href && isExternal(item.href)}
										<ExternalLink href={item.href} class={linkClass}>{item.text}</ExternalLink>
									{:else}
										{item.text}
									{/if}
								{/each}
							{/if}
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
