<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone = 'neutral',
		class: klass = '',
		children
	}: {
		tone?: 'neutral' | 'primary' | 'success' | 'danger' | 'warning';
		class?: string;
		children: Snippet;
	} = $props();

	const tones: Record<string, string> = {
		neutral: 'bg-surface-2 text-muted',
		primary: 'bg-primary/10 text-primary',
		success: 'bg-success-soft text-success',
		danger: 'bg-danger-soft text-danger',
		warning: 'bg-warning-soft text-warning'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium {tones[tone]} {klass}"
>
	{@render children()}
</span>
