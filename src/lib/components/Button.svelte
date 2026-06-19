<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		loading?: boolean;
		disabled?: boolean;
		href?: string;
		type?: 'button' | 'submit' | 'reset';
		class?: string;
		title?: string;
		'aria-label'?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let {
		variant = 'primary',
		size = 'md',
		loading = false,
		disabled = false,
		href,
		type = 'button',
		class: klass = '',
		onclick,
		children,
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition focus-visible:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none';
	const variants: Record<string, string> = {
		primary: 'bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm',
		secondary: 'bg-surface border border-border text-foreground hover:bg-surface-2',
		ghost: 'text-foreground hover:bg-surface-2',
		danger: 'bg-danger text-white hover:opacity-90 shadow-sm'
	};
	const sizes: Record<string, string> = {
		sm: 'px-3 py-1.5 text-sm',
		md: 'px-4 py-2 text-sm',
		lg: 'px-5 py-2.5 text-base'
	};

	let cls = $derived(`${base} ${variants[variant]} ${sizes[size]} ${klass}`);
	let isDisabled = $derived(disabled || loading);
</script>

{#snippet inner()}
	{#if loading}
		<svg class="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" opacity="0.25" />
			<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
		</svg>
	{/if}
	{@render children()}
{/snippet}

{#if href && !isDisabled}
	<a {href} class={cls} {...rest}>{@render inner()}</a>
{:else}
	<button {type} class={cls} disabled={isDisabled} {onclick} {...rest}>{@render inner()}</button>
{/if}
