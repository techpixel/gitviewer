<script lang="ts">
	import { Play, Pause, ChevronLeft, ChevronRight, Plus } from '@lucide/svelte';

	type Props = {
		min: number;
		max: number;
		value: number;
		onChange: (next: number) => void;
		playing: boolean;
		canPlay: boolean;
		onTogglePlay: () => void;
		speed: number;
		onSpeedChange: (next: number) => void;
		hasMore?: boolean;
		onLoadMore?: () => void;
		loadingMore?: boolean;
	};
	let {
		min,
		max,
		value,
		onChange,
		playing,
		canPlay,
		onTogglePlay,
		speed,
		onSpeedChange,
		hasMore = false,
		onLoadMore,
		loadingMore = false
	}: Props = $props();

	const SPEEDS = [0.5, 1, 2, 4, 8];

	function handleInput(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		onChange(v);
	}
</script>

<div class="scrubber">
	<button
		class="play"
		class:active={playing}
		onclick={onTogglePlay}
		disabled={!canPlay}
		title={playing ? 'Pause (Space)' : 'Play (Space)'}
		aria-label={playing ? 'Pause' : 'Play'}
	>
		{#if playing}
			<Pause size={16} fill="currentColor" />
		{:else}
			<Play size={16} fill="currentColor" />
		{/if}
	</button>

	<button
		class="step"
		onclick={() => onChange(Math.max(min, value - 1))}
		disabled={value <= min}
		title="Older (←)"
		aria-label="Older commit"
	>
		<ChevronLeft size={16} />
	</button>

	<div class="track-wrap">
		<input
			type="range"
			{min}
			{max}
			{value}
			oninput={handleInput}
			disabled={max <= min}
			aria-label="Commit timeline"
		/>
		<div class="endpoints">
			<span>oldest</span>
			<span>newest</span>
		</div>
	</div>

	<button
		class="step"
		onclick={() => onChange(Math.min(max, value + 1))}
		disabled={value >= max}
		title="Newer (→)"
		aria-label="Newer commit"
	>
		<ChevronRight size={16} />
	</button>

	<div class="speed" role="group" aria-label="Playback speed">
		{#each SPEEDS as s}
			<button
				class:active={speed === s}
				onclick={() => onSpeedChange(s)}
				title="{s}× speed"
			>{s}×</button>
		{/each}
	</div>

	{#if hasMore && onLoadMore}
		<button
			onclick={onLoadMore}
			disabled={loadingMore}
			class="load-older"
			title="Load older commits"
		>
			<Plus size={12} />
			<span>older</span>
		</button>
	{/if}
</div>

<style>
	.scrubber {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		flex-shrink: 0;
	}
	button {
		flex-shrink: 0;
	}
	.play,
	.step {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 32px;
		padding: 0;
	}
	.play.active {
		background: var(--accent-strong);
		border-color: var(--accent-strong);
		color: #fff;
	}
	.track-wrap {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	input[type='range'] {
		width: 100%;
		appearance: none;
		background: transparent;
		height: 24px;
		cursor: pointer;
		padding: 0;
		margin: 0;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 6px;
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	input[type='range']::-moz-range-track {
		height: 6px;
		background: var(--bg-elev-2);
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	input[type='range']::-webkit-slider-thumb {
		appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg);
		margin-top: -6px;
		cursor: grab;
	}
	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg);
		cursor: grab;
	}
	input[type='range']:active::-webkit-slider-thumb {
		cursor: grabbing;
	}
	.endpoints {
		display: flex;
		justify-content: space-between;
		font-size: 10px;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.speed {
		display: inline-flex;
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
	}
	.speed button {
		border: none;
		border-radius: 0;
		font-size: 11px;
		padding: 4px 8px;
		font-variant-numeric: tabular-nums;
		min-width: 32px;
	}
	.speed button + button {
		border-left: 1px solid var(--border);
	}
	.speed button.active {
		background: var(--accent-strong);
		color: #fff;
	}
	.load-older {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		padding: 4px 8px;
	}
</style>
