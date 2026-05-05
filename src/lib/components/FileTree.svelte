<script lang="ts" module>
	export type TreeNode = {
		name: string;
		path: string;
		type: 'tree' | 'blob';
		children: TreeNode[];
	};

	import type { TreeEntry } from '$lib/github';

	export function buildTree(entries: TreeEntry[]): TreeNode[] {
		const root: TreeNode = { name: '', path: '', type: 'tree', children: [] };

		for (const entry of entries) {
			if (entry.type === 'commit') continue;
			const parts = entry.path.split('/');
			let cursor = root;
			for (let i = 0; i < parts.length; i++) {
				const name = parts[i];
				const isLast = i === parts.length - 1;
				const fullPath = parts.slice(0, i + 1).join('/');
				let child = cursor.children.find((c) => c.name === name);
				if (!child) {
					child = {
						name,
						path: fullPath,
						type: isLast ? entry.type : 'tree',
						children: []
					};
					cursor.children.push(child);
				}
				cursor = child;
			}
		}

		sortRecursive(root);
		return root.children;
	}

	function sortRecursive(node: TreeNode) {
		node.children.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
			return a.name.localeCompare(b.name);
		});
		for (const child of node.children) sortRecursive(child);
	}
</script>

<script lang="ts">
	import Self from './FileTree.svelte';
	import type { CommitFile } from '$lib/github';
	import { ChevronRight, ChevronDown, Folder, FolderOpen, File } from '@lucide/svelte';

	type Props = {
		nodes: TreeNode[];
		filter?: string;
		onPick: (path: string, type: 'tree' | 'blob') => void;
		activePath?: string;
		fileStatuses?: Map<string, CommitFile>;
		changedFolders?: Set<string>;
		depth?: number;
		expanded?: Set<string>;
	};
	let {
		nodes,
		filter = '',
		onPick,
		activePath = '',
		fileStatuses,
		changedFolders,
		depth = 0,
		expanded = new Set<string>()
	}: Props = $props();

	type Badge = { letter: string; color: string; label: string } | null;

	function badgeFor(path: string): Badge {
		const f = fileStatuses?.get(path);
		if (!f) return null;
		switch (f.status) {
			case 'added':
				return { letter: 'A', color: 'add', label: 'Added in this commit' };
			case 'modified':
			case 'changed':
				return { letter: 'M', color: 'mod', label: 'Modified in this commit' };
			case 'renamed':
				return { letter: 'R', color: 'ren', label: `Renamed from ${f.previous_filename ?? '?'}` };
			case 'copied':
				return { letter: 'C', color: 'ren', label: 'Copied in this commit' };
			case 'removed':
				return { letter: 'D', color: 'del', label: 'Removed in this commit' };
			default:
				return null;
		}
	}

	const lcFilter = $derived(filter.trim().toLowerCase());

	function matchesFilter(node: TreeNode): boolean {
		if (!lcFilter) return true;
		if (node.path.toLowerCase().includes(lcFilter)) return true;
		if (node.type === 'tree') {
			return node.children.some(matchesFilter);
		}
		return false;
	}

	function toggle(path: string) {
		if (expanded.has(path)) expanded.delete(path);
		else expanded.add(path);
		expanded = new Set(expanded);
	}

	function isOpen(path: string): boolean {
		if (lcFilter) return true;
		return expanded.has(path);
	}
</script>

<ul class="tree" class:root={depth === 0}>
	{#each nodes as node (node.path)}
		{#if matchesFilter(node)}
			{@const open = node.type === 'tree' && isOpen(node.path)}
			<li>
				<div
					class="row"
					class:active={node.path === activePath}
					style="padding-left: {depth * 12 + 4}px"
				>
					{#if node.type === 'tree'}
						{@const folderChanged = changedFolders?.has(node.path) ?? false}
						<button
							class="entry"
							onclick={() => toggle(node.path)}
							title={node.path}
						>
							{#if open}
								<ChevronDown size={12} class="chev" />
								<FolderOpen size={14} class="ic" />
							{:else}
								<ChevronRight size={12} class="chev" />
								<Folder size={14} class="ic" />
							{/if}
							<span class="name">{node.name}</span>
							{#if folderChanged}
								<span class="folder-dot" title="Contains changes in this commit"></span>
							{/if}
						</button>
					{:else}
						{@const badge = badgeFor(node.path)}
						<button class="entry file" onclick={() => onPick(node.path, 'blob')} title={badge?.label ?? node.path}>
							<span class="chev-spacer"></span>
							<File size={14} class="ic" />
							<span class="name">{node.name}</span>
							{#if badge}
								<span class="badge {badge.color}">{badge.letter}</span>
							{/if}
						</button>
					{/if}
				</div>
				{#if open && node.children.length > 0}
					<Self
						nodes={node.children}
						{filter}
						{onPick}
						{activePath}
						{fileStatuses}
						{changedFolders}
						depth={depth + 1}
						{expanded}
					/>
				{/if}
			</li>
		{/if}
	{/each}
</ul>

<style>
	.tree {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.tree.root {
		padding-bottom: 8px;
	}
	li {
		margin: 0;
	}
	.row.active .entry {
		background: var(--bg-elev-2);
		box-shadow: inset 2px 0 0 var(--accent);
	}
	.entry {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		text-align: left;
		background: transparent;
		border: none;
		border-radius: 3px;
		padding: 3px 8px;
		font-size: 12.5px;
		color: var(--text);
		font-family: var(--font-sans);
		min-width: 0;
	}
	.entry:hover {
		background: var(--bg-elev-2);
	}
	.entry :global(.chev) {
		flex-shrink: 0;
		color: var(--text-dim);
	}
	.entry :global(.ic) {
		flex-shrink: 0;
		color: var(--text-dim);
	}
	.entry.file :global(.ic) {
		color: var(--text-dim);
	}
	.chev-spacer {
		width: 12px;
		flex-shrink: 0;
	}
	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.folder-dot {
		flex-shrink: 0;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #d29922;
		margin-left: 4px;
	}
	.badge {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 14px;
		height: 14px;
		padding: 0 3px;
		border-radius: 3px;
		font-size: 9.5px;
		font-weight: 700;
		font-family: var(--font-mono);
		letter-spacing: 0;
		margin-left: 4px;
		color: #fff;
	}
	.badge.add {
		background: var(--success);
	}
	.badge.mod {
		background: #d29922;
	}
	.badge.ren {
		background: var(--accent-strong);
	}
	.badge.del {
		background: var(--danger);
	}
</style>
