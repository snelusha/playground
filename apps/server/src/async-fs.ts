import type { FileEntry, StatEntry, DirEntry, WatchEvent } from "./types";

export interface AsyncFS {
	open(path: string): Promise<FileEntry | null>;
	stat(path: string): Promise<StatEntry | null>;
	readDir(path: string): Promise<DirEntry[] | null>;
	writeFile(path: string, content: string): Promise<boolean>;
	remove(path: string): Promise<boolean>;
	move(from: string, to: string): Promise<boolean>;
	mkdirAll(path: string): Promise<boolean>;
	watch(path: string, handler: (event: WatchEvent) => void): () => void;
}
