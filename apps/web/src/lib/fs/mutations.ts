export type FileMutation =
	| { type: "writeFile"; path: string; content: string }
	| { type: "mkdirAll"; path: string }
	| { type: "remove"; path: string }
	| { type: "move"; oldPath: string; newPath: string };

export type FileWatchEvent = {
	path: string;
	op: "create" | "modify" | "delete";
};

type FileMutationListener = (mutation: FileMutation) => void;

const listeners = new Set<FileMutationListener>();

export function publishFileMutation(mutation: FileMutation): void {
	for (const listener of listeners) listener(mutation);
}

export function subscribeFileMutations(
	listener: FileMutationListener,
): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}
