<script lang="ts">
	import type { ComparePage } from '$lib/core/compare';
	import { isCompareOptionDisabled } from '$lib/core/compare-state';

	let {
		sections,
		selected,
		max,
		onchange
	}: {
		sections: ComparePage['sections'];
		selected: readonly string[];
		max: number;
		onchange: (id: string, checked: boolean) => void;
	} = $props();
</script>

<div data-testid="compare-picker" class="grid grid-cols-1 gap-4 md:grid-cols-2">
	{#each sections as section (section.id)}
		<fieldset
			data-testid="compare-section"
			data-section-id={section.id}
			class="min-w-0 rounded-2xl p-5 ring-1 ring-zinc-200"
		>
			<legend class="px-1 font-heading text-lg font-semibold text-zinc-900">
				{section.title}
			</legend>
			<div class="mt-2 flex flex-col gap-2">
				{#each section.tools as tool (tool.id)}
					{@const disabled = isCompareOptionDisabled(selected, tool.id, max)}
					<label
						class={['flex items-start gap-2 text-sm', disabled ? 'text-zinc-600' : 'text-zinc-800']}
					>
						<input
							type="checkbox"
							name="tools"
							value={tool.id}
							checked={selected.includes(tool.id)}
							{disabled}
							onchange={(event) => onchange(tool.id, event.currentTarget.checked)}
							class="mt-0.5 size-4 shrink-0 accent-blue-600"
						/>
						<span class="break-words">{tool.name}</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{/each}
</div>
