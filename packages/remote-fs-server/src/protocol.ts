export const PROTOCOL_VERSION = 1;

export type RemoteFsMethod =
	| "open"
	| "stat"
	| "readDir"
	| "writeFile"
	| "remove"
	| "move"
	| "mkdirAll";

export type RemoteFsRequest =
	| {
			v: number;
			id: string;
			method: "open" | "stat" | "readDir" | "remove" | "mkdirAll";
			params: { path: string };
	  }
	| {
			v: number;
			id: string;
			method: "writeFile";
			params: { path: string; content: string };
	  }
	| {
			v: number;
			id: string;
			method: "move";
			params: { oldPath: string; newPath: string };
	  };

export type OpenResult = {
	content: string;
	size: number;
	modTime: number;
	isDir: boolean;
};

export type StatResult = {
	name: string;
	size: number;
	modTime: number;
	isDir: boolean;
};

export type DirEntry = {
	name: string;
	isDir: boolean;
};

export type RemoteFsResult =
	| OpenResult
	| StatResult
	| DirEntry[]
	| boolean
	| null;

export type RemoteFsSuccess = {
	v: number;
	id: string;
	ok: true;
	result: RemoteFsResult;
};

export type RemoteFsFailure = {
	v: number;
	id: string;
	ok: false;
	error: {
		code: string;
		message: string;
	};
};

export type RemoteFsResponse = RemoteFsSuccess | RemoteFsFailure;
