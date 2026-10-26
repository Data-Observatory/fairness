<script lang="ts">
	import type { WizardView } from '$lib/core/view';
	import * as m from '$lib/paraglide/messages';

	type Question = WizardView['questions'][number];

	let {
		question,
		kind,
		selected,
		counts,
		focusTarget = false,
		onchange,
		onclear
	}: {
		question: Question;
		/** radio: one answer and a "no preference" choice (simple). checkbox: several answers (advanced). */
		kind: 'radio' | 'checkbox';
		selected: readonly string[];
		/** Tools left by each option, given the answers to the other questions. */
		counts: Record<string, number>;
		/** The fieldset receives focus after a step change (a legend is not focusable in Firefox). */
		focusTarget?: boolean;
		onchange: (option: string, checked: boolean) => void;
		onclear: () => void;
	} = $props();

	const helpId = $derived(`wizard-help-${question.id}`);
	const optionClass = 'flex items-start gap-2 text-sm';
</script>

<fieldset
	data-testid="wizard-question"
	data-question-id={question.id}
	aria-describedby={question.help ? helpId : undefined}
	data-wizard-focus={focusTarget ? '' : undefined}
	tabindex="-1"
	class="min-w-0 rounded-2xl p-5 ring-1 ring-zinc-200 focus:outline-none print:hidden"
>
	<legend class="px-1 font-heading text-lg font-semibold text-zinc-900">
		{question.question}
	</legend>
	{#if question.help}
		<p id={helpId} class="mt-1 max-w-3xl text-sm text-zinc-700">{question.help}</p>
	{/if}
	<div class="mt-4 flex flex-col gap-2">
		{#if kind === 'radio'}
			<label class={[optionClass, 'text-zinc-800']}>
				<input
					type="radio"
					name={question.id}
					value=""
					data-testid="wizard-no-preference"
					checked={selected.length === 0}
					onchange={onclear}
					class="mt-0.5 size-4 shrink-0 accent-blue-600"
				/>
				<span>{m.wizard_no_preference()}</span>
			</label>
		{/if}
		{#each question.options as option (option.id)}
			{@const checked = selected.includes(option.id)}
			{@const disabled = !checked && (counts[option.id] ?? 0) === 0}
			<label class={[optionClass, disabled ? 'text-zinc-600' : 'text-zinc-800']}>
				<input
					type={kind}
					name={question.id}
					value={option.id}
					{checked}
					{disabled}
					onchange={(event) => onchange(option.id, event.currentTarget.checked)}
					class="mt-0.5 size-4 shrink-0 accent-blue-600"
				/>
				<span>
					{option.label}
					{#if option.description}
						<span class="block text-zinc-700">{option.description}</span>
					{/if}
				</span>
			</label>
		{/each}
	</div>
</fieldset>
