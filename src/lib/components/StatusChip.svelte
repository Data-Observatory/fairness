<script lang="ts">
	import type { Chip } from '$lib/core/view';

	let { chip }: { chip: Chip } = $props();

	// Status carries a text label and an icon, so it never relies on colour alone.
	const styles: Record<string, string> = {
		available: 'bg-blue-50 text-blue-900 ring-blue-200',
		limited: 'bg-amber-50 text-amber-900 ring-amber-300',
		unverified: 'bg-zinc-100 text-zinc-800 ring-zinc-300',
		discontinued: 'bg-red-50 text-red-900 ring-red-200'
	};
	const icons: Record<string, string> = {
		available: 'M4 10.5l3.5 3.5L16 5.5',
		limited: 'M10 4v7M10 15v.01',
		unverified: 'M7.5 7.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M10 15v.01',
		discontinued: 'M5 5l10 10M15 5L5 15'
	};
</script>

<span
	data-status={chip.id}
	class={[
		'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
		styles[chip.id] ?? styles.unverified
	]}
>
	<svg
		aria-hidden="true"
		viewBox="0 0 20 20"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="size-3.5"
	>
		<path d={icons[chip.id] ?? icons.unverified} />
	</svg>
	{chip.label}
</span>
