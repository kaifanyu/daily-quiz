<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Nav from '$lib/components/Nav.svelte';
	import SiteNav from '$lib/components/SiteNav.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	// `/live` is a separate little site with its own retro chrome — it opts out
	// of the quiz app's navigation and container entirely.
	let standalone = $derived(
		page.url.pathname === '/live' || page.url.pathname.startsWith('/live/')
	);
	let notebook = $derived(page.url.pathname === '/');
	let quiz = $derived(
		['/daily-quiz', '/quiz', '/history', '/sources', '/topics', '/prompts'].some(
			(path) => page.url.pathname === path || page.url.pathname.startsWith(`${path}/`)
		)
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Labbook</title>
</svelte:head>

{#if standalone}
	{@render children()}
{:else}
	<div class="site-shell" class:notebook-shell={notebook}>
		<SiteNav access={data.notebookAccess} />
		{#if quiz}<Nav />{/if}
		<main id="site-content" class:contained={!notebook} tabindex="-1">
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.site-shell {
		min-height: 100vh;
		background: var(--background);
		font-family:
			'Segoe UI',
			-apple-system,
			BlinkMacSystemFont,
			sans-serif;
		--primary: #2862da;
		--primary-hover: #1d4eb7;
		--ring: #2862da;
	}
	.notebook-shell {
		background: #f5f7f9;
		--background: #f5f7f9;
		--surface: #fff;
		--surface-2: #f1f5f9;
		--border: #e2e7ee;
		--foreground: #304258;
		--muted: #7d8999;
		--primary-foreground: #fff;
	}
	.contained {
		max-width: 1152px;
		margin: 0 auto;
		padding: 32px 24px;
	}
	:global(.dark) .site-shell:not(.notebook-shell) {
		--primary: #8aafff;
		--primary-hover: #b3caff;
		--ring: #8aafff;
		--primary-foreground: #102242;
	}
	@media (max-width: 640px) {
		.contained {
			padding: 24px 16px;
		}
	}
</style>
