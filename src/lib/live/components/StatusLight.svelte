<script lang="ts">
	/**
	 * Faux CRT status lamp. The colour is decorative — the label and the shape
	 * carry the meaning, so state is never communicated by colour alone (§21).
	 */
	interface Props {
		tone: 'live' | 'idle' | 'error';
		label: string;
		pulse?: boolean;
	}

	let { tone, label, pulse = false }: Props = $props();

	const glyph = { live: '●', idle: '○', error: '✕' } as const;
</script>

<span class="lamp lamp--{tone}" class:lamp--pulse={pulse}>
	<span class="lamp__dot" aria-hidden="true">{glyph[tone]}</span>
	<span class="lamp__label">{label}</span>
</span>

<style>
	.lamp {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 9px;
		border: 2px solid var(--ink);
		border-radius: 999px;
		background: var(--paper);
		font-family: var(--font-pixel);
		font-size: 8px;
		line-height: 1.6;
		white-space: nowrap;
	}

	.lamp__dot {
		font-size: 10px;
		line-height: 1;
	}

	.lamp--live {
		background: #d8fbef;
	}
	.lamp--live .lamp__dot {
		color: var(--mint-600);
	}

	.lamp--idle {
		background: var(--lav-200);
	}
	.lamp--idle .lamp__dot {
		color: var(--lav-600);
	}

	.lamp--error {
		background: #ffe0e6;
	}
	.lamp--error .lamp__dot {
		color: #c0392b;
	}

	.lamp--pulse .lamp__dot {
		animation: retro-blink 1.6s ease-in-out infinite;
	}
</style>
