<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from './ThemeToggle.svelte';
	import Button from './Button.svelte';

	const links = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/history', label: 'History' },
		{ href: '/sources', label: 'Sources' },
		{ href: '/prompts', label: 'Prompts' }
	];

	let pathname = $derived(page.url.pathname);
	let mobileOpen = $state(false);

	function isActive(href: string): boolean {
		return href === '/' ? pathname === '/' : pathname.startsWith(href);
	}
</script>

<header class="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
	<nav class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
		<div class="flex items-center gap-6">
			<a href="/" class="flex items-center gap-2.5">
				<span
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm"
					>DQ</span
				>
				<span class="text-base font-semibold text-foreground">Daily Quiz</span>
			</a>

			<div class="hidden items-center gap-1 md:flex">
				{#each links as link (link.href)}
					<a
						href={link.href}
						class="rounded-lg px-3 py-2 text-sm font-medium transition {isActive(link.href)
							? 'bg-surface-2 text-foreground'
							: 'text-muted hover:bg-surface-2 hover:text-foreground'}"
					>
						{link.label}
					</a>
				{/each}
			</div>
		</div>

		<div class="flex items-center gap-2">
			<div class="hidden sm:block">
				<Button href="/quiz/new" size="sm">New Quiz</Button>
			</div>
			<ThemeToggle />
			<button
				type="button"
				class="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground md:hidden"
				aria-label="Toggle menu"
				onclick={() => (mobileOpen = !mobileOpen)}
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
					{#if mobileOpen}
						<path d="M18 6 6 18M6 6l12 12" />
					{:else}
						<path d="M3 12h18M3 6h18M3 18h18" />
					{/if}
				</svg>
			</button>
		</div>
	</nav>

	{#if mobileOpen}
		<div class="border-t border-border bg-surface px-4 py-3 md:hidden">
			<div class="flex flex-col gap-1">
				{#each links as link (link.href)}
					<a
						href={link.href}
						onclick={() => (mobileOpen = false)}
						class="rounded-lg px-3 py-2 text-sm font-medium transition {isActive(link.href)
							? 'bg-surface-2 text-foreground'
							: 'text-muted hover:bg-surface-2'}"
					>
						{link.label}
					</a>
				{/each}
				<a
					href="/quiz/new"
					onclick={() => (mobileOpen = false)}
					class="mt-1 rounded-lg bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground"
				>
					New Quiz
				</a>
			</div>
		</div>
	{/if}
</header>
