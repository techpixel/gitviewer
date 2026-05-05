<script lang="ts">
	import type { AnnotatedLine } from '$lib/github';

	type Props = {
		lines: AnnotatedLine[];
		filename: string;
		loading: boolean;
		error: string | null;
	};
	let { lines, filename, loading, error }: Props = $props();

	const lineCount = $derived(lines.length);
	const maxNo = $derived(
		lines.reduce((acc, l) => {
			const n = l.type === 'removed' ? l.oldLineNo : l.lineNo;
			return n > acc ? n : acc;
		}, 0)
	);
	const gutterWidth = $derived(`${Math.max(2, String(maxNo).length)}ch`);
	const hasContent = $derived(lineCount > 0);
</script>

{#if loading}
	<div class="state">Loading {filename}…</div>
{:else if error}
	<div class="state error">
		<strong>Couldn't load file.</strong>
		<p>{error}</p>
	</div>
{:else if !hasContent}
	<div class="state">
		<strong>Empty file.</strong>
		<p>{filename} has no content at this commit.</p>
	</div>
{:else}
	<pre class="code" style="--gutter: {gutterWidth};"><code
			>{#each lines as line, i (i)}{#if line.type === 'removed'}<span class="row removed"><span class="ln">{line.oldLineNo}</span><span class="src">{line.text || ' '}</span></span
				>{:else if line.type === 'added'}<span class="row added"><span class="ln">{line.lineNo}</span><span class="src">{line.text || ' '}</span></span
				>{:else}<span class="row"><span class="ln">{line.lineNo}</span><span class="src">{line.text || ' '}</span></span
				>{/if}{/each}</code
		></pre>
{/if}

<style>
	.state {
		padding: 48px 24px;
		text-align: center;
		color: var(--text-dim);
	}
	.state.error strong {
		color: var(--danger);
		display: block;
		margin-bottom: 8px;
	}
	.state p {
		margin: 8px 0 0 0;
	}
	.code {
		margin: 0;
		padding: 0;
		background: var(--bg-elev);
		font-family: var(--font-mono);
		font-size: 12.5px;
		line-height: 1.55;
		overflow: auto;
		min-height: 0;
	}
	.code code {
		display: block;
		min-width: 100%;
	}
	.row {
		display: flex;
		align-items: flex-start;
	}
	.row:hover {
		background: var(--bg-elev-2);
	}
	.row.added {
		background: rgba(46, 160, 67, 0.18);
	}
	.row.added .ln {
		background: rgba(46, 160, 67, 0.18);
		color: var(--success);
		border-left: 2px solid var(--success);
		padding-left: 14px;
	}
	.row.added:hover {
		background: rgba(46, 160, 67, 0.26);
	}
	.row.removed {
		background: rgba(248, 81, 73, 0.16);
	}
	.row.removed .ln {
		background: rgba(248, 81, 73, 0.16);
		color: var(--danger);
		border-left: 2px solid var(--danger);
		padding-left: 14px;
	}
	.row.removed .src {
		color: var(--text-dim);
		text-decoration: line-through;
		text-decoration-color: rgba(248, 81, 73, 0.6);
	}
	.row.removed:hover {
		background: rgba(248, 81, 73, 0.24);
	}
	.ln {
		flex-shrink: 0;
		width: var(--gutter);
		padding: 0 12px 0 16px;
		text-align: right;
		color: var(--text-dim);
		user-select: none;
		border-right: 1px solid var(--border);
		font-variant-numeric: tabular-nums;
		position: sticky;
		left: 0;
		background: var(--bg-elev);
	}
	.row:hover .ln {
		background: var(--bg-elev-2);
	}
	.src {
		padding: 0 16px;
		white-space: pre;
		flex: 1;
	}
</style>
