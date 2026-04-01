export interface FileEntry {
	content: string;
	size: number;
	modTime: number;
	isDir: boolean;
}

export interface StatEntry {
	name: string;
	size: number;
	modTime: number;
	isDir: boolean;
}

export interface DirEntry {
	name: string;
	isDir: boolean;
}

export interface WatchEvent {
	path: string;
	kind: "change" | "delete";
}

export interface WsRequest {
	id: string;
	method: string;
	params?: Record<string, unknown>;
}

export interface WsResponse {
	id: string;
	result?: unknown;
	error?: { message: string };
}

export interface WsPush {
	channel: string;
	data: unknown;
}

export type PushHandler = (data: unknown) => void;

export interface Pending {
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}
