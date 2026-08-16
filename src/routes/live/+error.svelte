<script lang="ts">
	import { page } from '$app/state';
	import RetroWindow from '$lib/live/components/RetroWindow.svelte';

	// Deliberately vague: an unauthorized visitor learns nothing about what is
	// behind the door, and no server internals are ever echoed back (SR-18).
	const copy: Record<number, { title: string; line: string; hint: string }> = {
		401: {
			title: 'locked ♡',
			line: 'this little window is closed',
			hint: 'sign in with the invited address to come in'
		},
		403: {
			title: 'locked ♡',
			line: 'this little window is closed',
			hint: 'this account is not on the guest list'
		},
		503: {
			title: 'not open yet ♡',
			line: 'the room is still being decorated',
			hint: 'check back in a bit'
		}
	};

	let info = $derived(
		copy[page.status] ?? {
			title: 'oops ♡',
			line: 'something went a little sideways',
			hint: 'try again in a moment'
		}
	);
</script>

<svelte:head>
	<title>♡</title>
</svelte:head>

<div class="retro-shell error-shell">
	<RetroWindow title={info.title} accent="lavender">
		<div class="art" aria-hidden="true">
			<pre>
   .--------.
  /  ^    ^  \
 |     __     |
  \  \____/  /
   '--------'
      zzz...
</pre>
		</div>
		<p class="line">{info.line}</p>
		<p class="pixel muted hint">{info.hint}</p>
	</RetroWindow>
</div>

<style>
	.error-shell {
		max-width: 460px;
		padding-top: 12vh;
	}

	.art {
		display: flex;
		justify-content: center;
		color: var(--pink-700);
	}

	.art pre {
		font-family: var(--font-body);
		font-size: 13px;
		line-height: 1.35;
		margin: 0;
	}

	.line {
		text-align: center;
		font-weight: 800;
		margin: 0;
	}

	.hint {
		text-align: center;
		margin: 0;
	}
</style>
