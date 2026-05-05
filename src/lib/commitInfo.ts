import type { CommitFile } from './github';

/**
 * Per-commit info used by both the repo-wide scrubber view and the per-file
 * viewer. `files` is the raw list from the GitHub commit detail endpoint;
 * `statuses` is a lookup keyed by both `filename` and `previous_filename`
 * so callers can resolve a path regardless of which side of a rename they
 * have.
 */
export type CommitInfo = {
	files: CommitFile[];
	statuses: Map<string, CommitFile>;
};

export const EMPTY_INFO: CommitInfo = { files: [], statuses: new Map() };

export function buildCommitInfo(files: CommitFile[]): CommitInfo {
	const statuses = new Map<string, CommitFile>();
	for (const f of files) {
		statuses.set(f.filename, f);
		if (f.previous_filename) statuses.set(f.previous_filename, f);
	}
	return { files, statuses };
}

/**
 * Set of every ancestor folder path under which at least one file changed.
 * Used to render the marker dot on folder rows in the file tree.
 */
export function computeChangedFolders(map: Map<string, CommitFile>): Set<string> {
	const set = new Set<string>();
	for (const path of map.keys()) {
		const parts = path.split('/');
		for (let i = 1; i < parts.length; i++) {
			set.add(parts.slice(0, i).join('/'));
		}
	}
	return set;
}
