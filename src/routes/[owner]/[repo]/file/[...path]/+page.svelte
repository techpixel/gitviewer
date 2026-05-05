<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import {
		listCommits,
		getFileAtRef,
		getRepoTree,
		getCommitDetail,
		annotateContent,
		shortSha,
		commitTitle,
		GitHubError,
		type CommitSummary,
		type RepoRef,
		type TreeEntry
	} from '$lib/github';
	import {
		buildCommitInfo,
		computeChangedFolders,
		EMPTY_INFO,
		type CommitInfo
	} from '$lib/commitInfo';
	import { auth } from '$lib/token.svelte';
	import RepoSidebar from '$lib/components/RepoSidebar.svelte';
	import FileViewer from '$lib/components/FileViewer.svelte';
	import Scrubber from '$lib/components/Scrubber.svelte';
	import { ArrowLeft, ExternalLink, PanelLeftClose, PanelLeftOpen, FileText } from '@lucide/svelte';

	const repoRef = $derived<RepoRef>({ owner: page.params.owner!, repo: page.params.repo! });
	const filePath = $derived(decodeURIComponent(page.params.path!));

	let commits = $state<CommitSummary[]>([]);
	let listError = $state<string | null>(null);
	let listLoading = $state(true);
	let nextPage = $state(2);
	let hasMore = $state(true);
	let loadingMore = $state(false);

	// Newest = 0; oldest = commits.length - 1.
	let currentIndex = $state(0);
	let sidebarVisible = $state(true);

	// File content per commit
	type ContentEntry = { content: string | null; size: number; encoding: 'utf-8' | 'binary' };
	const contentCache = new Map<string, ContentEntry>();
	let currentContent = $state('');
	let currentEncoding = $state<'utf-8' | 'binary'>('utf-8');
	let currentSize = $state(0);
	let contentLoading = $state(false);
	let contentError = $state<string | null>(null);

	// Per-commit info: list of every file touched + lookup map. Drives both
	// the inline +/− line rendering for the current file (via the file's patch)
	// and the file-tree status badges / folder marker dots.
	const commitInfoCache = new Map<string, CommitInfo>();
	let currentInfo = $state<CommitInfo>(EMPTY_INFO);

	// Per-commit repo tree (so file structure updates during scrub/play)
	type TreeEntry2 = TreeEntry;
	const treeCache = new Map<string, { tree: TreeEntry2[]; truncated: boolean }>();
	let treeEntries = $state<TreeEntry[] | null>(null);
	let treeTruncated = $state(false);
	let treeLoading = $state(false);
	let treeError = $state<string | null>(null);

	// Playback
	let playing = $state(false);
	let playSpeed = $state(1);
	const BASE_INTERVAL_MS = 900;
	let playTimer: ReturnType<typeof setInterval> | null = null;

	const currentCommit = $derived(commits[currentIndex]);
	const lastIndex = $derived(commits.length > 0 ? commits.length - 1 : 0);
	const scrubValue = $derived(lastIndex - currentIndex);

	$effect(() => {
		void filePath;
		void repoRef.owner;
		void repoRef.repo;
		commits = [];
		currentIndex = 0;
		nextPage = 2;
		hasMore = true;
		listError = null;
		contentCache.clear();
		commitInfoCache.clear();
		treeCache.clear();
		currentContent = '';
		currentInfo = EMPTY_INFO;
		treeEntries = null;
		stopPlay();
		void loadInitial();
	});

	async function loadInitial() {
		listLoading = true;
		listError = null;
		try {
			const result = await listCommits(repoRef, {
				token: auth.token,
				perPage: 50,
				page: 1
			});
			commits = result;
			hasMore = result.length === 50;
			currentIndex = 0;
			if (result.length > 0) {
				void ensureContent(result[0].sha);
				void ensureCommitInfo(result[0].sha);
				void ensureTree(result[0].sha);
			}
		} catch (e) {
			listError = e instanceof Error ? e.message : String(e);
		} finally {
			listLoading = false;
		}
	}

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const more = await listCommits(repoRef, {
				token: auth.token,
				perPage: 50,
				page: nextPage
			});
			commits = [...commits, ...more];
			nextPage += 1;
			if (more.length < 50) hasMore = false;
		} catch (e) {
			listError = e instanceof Error ? e.message : String(e);
		} finally {
			loadingMore = false;
		}
	}

	async function ensureContent(sha: string) {
		const cached = contentCache.get(sha);
		if (cached) {
			applyContent(sha, cached);
			return;
		}
		contentLoading = true;
		contentError = null;
		try {
			const result = await getFileAtRef(repoRef, filePath, sha, { token: auth.token });
			const entry: ContentEntry = result
				? { content: result.content, size: result.size, encoding: result.encoding }
				: { content: null, size: 0, encoding: 'utf-8' };
			contentCache.set(sha, entry);
			if (currentCommit?.sha === sha) applyContent(sha, entry);
		} catch (e) {
			if (currentCommit?.sha === sha) {
				contentError =
					e instanceof GitHubError
						? e.message
						: e instanceof Error
							? e.message
							: 'Unknown error';
				contentLoading = false;
			}
		}
	}

	function applyContent(sha: string, entry: ContentEntry) {
		if (currentCommit?.sha !== sha) return;
		if (entry.content === null) {
			contentError = `${filePath} did not exist at this commit.`;
			currentContent = '';
		} else {
			contentError = null;
			currentContent = entry.content;
		}
		currentEncoding = entry.encoding;
		currentSize = entry.size;
		contentLoading = false;
	}

	async function ensureCommitInfo(sha: string) {
		const cached = commitInfoCache.get(sha);
		if (cached) {
			if (currentCommit?.sha === sha) currentInfo = cached;
			return;
		}
		try {
			const detail = await getCommitDetail(repoRef, sha, { token: auth.token });
			const info = buildCommitInfo(detail.files ?? []);
			commitInfoCache.set(sha, info);
			if (currentCommit?.sha === sha) currentInfo = info;
		} catch {
			// Highlighting + tree badges are a nice-to-have; ignore failure.
			commitInfoCache.set(sha, EMPTY_INFO);
			if (currentCommit?.sha === sha) currentInfo = EMPTY_INFO;
		}
	}

	async function ensureTree(sha: string) {
		const cached = treeCache.get(sha);
		if (cached) {
			treeEntries = cached.tree;
			treeTruncated = cached.truncated;
			treeLoading = false;
			treeError = null;
			return;
		}
		// Don't blank the existing tree while we fetch — keeps the sidebar
		// visually stable during scrub.
		if (!treeEntries) treeLoading = true;
		try {
			const result = await getRepoTree(repoRef, sha, { token: auth.token });
			treeCache.set(sha, { tree: result.tree, truncated: result.truncated });
			if (currentCommit?.sha === sha) {
				treeEntries = result.tree;
				treeTruncated = result.truncated;
				treeError = null;
			}
		} catch (e) {
			if (!treeEntries) {
				treeError = e instanceof Error ? e.message : String(e);
			}
		} finally {
			treeLoading = false;
		}
	}

	$effect(() => {
		if (!currentCommit) return;
		void ensureContent(currentCommit.sha);
		void ensureCommitInfo(currentCommit.sha);
		// Tree refresh is throttled during fast playback to avoid hammering.
		if (!playing || playSpeed <= 2) {
			void ensureTree(currentCommit.sha);
		}
	});

	// Annotated lines feed FileViewer; folder marker set + statuses feed the sidebar.
	const currentPatch = $derived(
		currentInfo.files.find((f) => f.filename === filePath || f.previous_filename === filePath)
			?.patch ?? ''
	);
	const annotated = $derived(
		currentEncoding === 'binary' ? [] : annotateContent(currentContent, currentPatch)
	);
	const addedCount = $derived(annotated.filter((l) => l.type === 'added').length);
	const removedCount = $derived(annotated.filter((l) => l.type === 'removed').length);
	const removedFileCount = $derived(
		currentInfo.files.filter((f) => f.status === 'removed').length
	);
	const fileStatuses = $derived(currentInfo.statuses);
	const changedFolders = $derived(computeChangedFolders(currentInfo.statuses));
	const touchedThisFile = $derived(currentInfo.statuses.has(filePath));

	function setScrubValue(v: number) {
		const clamped = Math.max(0, Math.min(lastIndex, v));
		currentIndex = lastIndex - clamped;
		if (playing) stopPlay();
	}

	function step(delta: number) {
		setScrubValue(scrubValue + delta);
	}

	function startPlay() {
		if (commits.length < 2) return;
		if (currentIndex === 0) currentIndex = lastIndex;
		playing = true;
		const interval = BASE_INTERVAL_MS / playSpeed;
		playTimer = setInterval(() => {
			if (currentIndex <= 0) {
				stopPlay();
				return;
			}
			currentIndex -= 1;
		}, interval);
	}

	function stopPlay() {
		playing = false;
		if (playTimer) {
			clearInterval(playTimer);
			playTimer = null;
		}
	}

	function togglePlay() {
		if (playing) stopPlay();
		else startPlay();
	}

	function setSpeed(s: number) {
		playSpeed = s;
		if (playing) {
			// Restart the interval at the new speed.
			stopPlay();
			startPlay();
		}
	}

	onDestroy(stopPlay);

	function pickPath(path: string, type: 'tree' | 'blob') {
		if (type !== 'blob') return;
		const encoded = path
			.split('/')
			.map((seg) => encodeURIComponent(seg))
			.join('/');
		goto(`/${repoRef.owner}/${repoRef.repo}/file/${encoded}`);
	}

	function selectCommit(i: number) {
		if (i >= 0 && i < commits.length) {
			currentIndex = i;
			if (playing) stopPlay();
		}
	}

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			step(-1);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			step(1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			setScrubValue(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			setScrubValue(lastIndex);
		} else if (e.key === ' ' || e.code === 'Space') {
			e.preventDefault();
			togglePlay();
		} else if (e.key === 's' || e.key === 'S') {
			sidebarVisible = !sidebarVisible;
		}
	}

	const dateStr = $derived(
		currentCommit?.commit.author?.date
			? new Date(currentCommit.commit.author.date).toLocaleString()
			: ''
	);
</script>

<svelte:head>
	<title>{filePath} — {repoRef.owner}/{repoRef.repo}</title>
</svelte:head>

<svelte:window onkeydown={onKey} />

<div class="page">
	{#if sidebarVisible}
		<RepoSidebar
			{commits}
			{currentIndex}
			onSelectCommit={selectCommit}
			onLoadMore={loadMore}
			{loadingMore}
			{hasMore}
			{treeEntries}
			{treeLoading}
			{treeError}
			{treeTruncated}
			activePath={filePath}
			{fileStatuses}
			{changedFolders}
			onPickPath={pickPath}
		/>
	{/if}

	<div class="main">
		<div class="toolbar">
			<button
				class="icon-btn"
				onclick={() => (sidebarVisible = !sidebarVisible)}
				title="Toggle sidebar (S)"
				aria-label="Toggle sidebar"
			>
				{#if sidebarVisible}
					<PanelLeftClose size={16} />
				{:else}
					<PanelLeftOpen size={16} />
				{/if}
			</button>
			<a href="/{repoRef.owner}/{repoRef.repo}" class="back">
				<ArrowLeft size={14} />
				<span>Repo</span>
			</a>
			<div class="path-label" title={filePath}>
				<FileText size={14} class="path-icon" />
				<span class="path-text">{filePath}</span>
				{#if currentEncoding === 'binary'}
					<span class="tag">binary</span>
				{/if}
			</div>
			<div class="spacer"></div>
			{#if currentCommit}
				<a
					href={currentCommit.html_url}
					target="_blank"
					rel="noreferrer noopener"
					class="github-link"
					title="View this commit on GitHub"
				>
					<span>{shortSha(currentCommit.sha)}</span>
					<ExternalLink size={12} />
				</a>
			{/if}
		</div>

		{#if commits.length > 0}
			<Scrubber
				min={0}
				max={lastIndex}
				value={scrubValue}
				onChange={setScrubValue}
				{playing}
				canPlay={commits.length > 1}
				onTogglePlay={togglePlay}
				speed={playSpeed}
				onSpeedChange={setSpeed}
				{hasMore}
				onLoadMore={loadMore}
				{loadingMore}
			/>
			<div class="commit-meta">
				<div class="commit-title">
					{commitTitle(currentCommit?.commit.message ?? '')}
					{#if touchedThisFile}
						<span class="touched-badge" title="This commit changed {filePath}">touched</span>
					{/if}
				</div>
				<div class="commit-sub">
					<span class="counter">commit {scrubValue + 1} of {commits.length}{hasMore ? '+' : ''}</span>
					<span class="sep">·</span>
					<span>{currentCommit?.commit.author?.name ?? 'unknown'}</span>
					<span class="sep">·</span>
					<span>{dateStr}</span>
					{#if touchedThisFile}
						{#if addedCount > 0}
							<span class="sep">·</span>
							<span class="stat-add">+{addedCount}</span>
						{/if}
						{#if removedCount > 0}
							<span class="stat-del">−{removedCount}</span>
						{/if}
					{/if}
				</div>
			</div>
		{/if}

		<div class="content">
			{#if listLoading}
				<div class="centered">Loading history of {filePath}…</div>
			{:else if listError}
				<div class="centered error">
					<strong>Couldn't load file history.</strong>
					<p>{listError}</p>
					<button onclick={() => loadInitial()}>Retry</button>
				</div>
			{:else if commits.length === 0}
				<div class="centered">
					<strong>No commits touched <code>{filePath}</code>.</strong>
					<p>Check that the path is correct (case-sensitive, relative to repo root).</p>
				</div>
			{:else if currentEncoding === 'binary'}
				<div class="centered">
					<strong>Binary file ({currentSize} bytes).</strong>
					<p>Open it on GitHub to view.</p>
				</div>
			{:else}
				{#key currentCommit?.sha}
					<FileViewer
						lines={annotated}
						filename={filePath}
						loading={contentLoading}
						error={contentError}
					/>
				{/key}
			{/if}
		</div>
	</div>
</div>

<style>
	.page {
		flex: 1;
		display: flex;
		min-height: 0;
		overflow: hidden;
	}
	.main {
		flex: 1;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		flex-shrink: 0;
	}
	.icon-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 30px;
		padding: 0;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
		color: var(--text-dim);
		padding: 4px 8px;
		border-radius: 6px;
	}
	.back:hover {
		color: var(--accent);
		background: var(--bg-elev-2);
		text-decoration: none;
	}
	.path-label {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-mono);
		font-size: 13px;
		min-width: 0;
		overflow: hidden;
	}
	.path-label :global(.path-icon) {
		flex-shrink: 0;
		color: var(--text-dim);
	}
	.path-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tag {
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: var(--bg-elev-2);
		color: var(--text-dim);
		padding: 1px 6px;
		border-radius: 999px;
		flex-shrink: 0;
	}
	.spacer {
		flex: 1;
	}
	.github-link {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--text-dim);
		padding: 4px 8px;
		border-radius: 6px;
	}
	.github-link:hover {
		color: var(--accent);
		background: var(--bg-elev-2);
		text-decoration: none;
	}
	.commit-meta {
		padding: 8px 16px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elev);
		flex-shrink: 0;
	}
	.commit-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 2px;
	}
	.commit-title :first-child,
	.commit-title > :not(.touched-badge) {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.touched-badge {
		flex-shrink: 0;
		font-size: 10px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: rgba(46, 160, 67, 0.18);
		color: var(--success);
		border: 1px solid rgba(46, 160, 67, 0.4);
		padding: 1px 6px;
		border-radius: 999px;
	}
	.commit-sub {
		font-size: 11px;
		color: var(--text-dim);
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
	}
	.counter {
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.sep {
		color: var(--border);
	}
	.stat-add {
		color: var(--success);
		font-variant-numeric: tabular-nums;
	}
	.stat-del {
		color: var(--danger);
		font-variant-numeric: tabular-nums;
	}
	.content {
		flex: 1;
		overflow: hidden;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.content :global(.code) {
		flex: 1;
	}
	.centered {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 64px 24px;
		color: var(--text-dim);
		text-align: center;
	}
	.centered.error strong {
		color: var(--danger);
	}
	.centered code {
		font-family: var(--font-mono);
		background: var(--bg-elev-2);
		padding: 1px 6px;
		border-radius: 4px;
	}
</style>
