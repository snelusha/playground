export const REMOTE_FS_PROTOCOL_VERSION = 1;

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

export type RemoteFsResponse =
	| { v: number; id: string; ok: true; result: unknown }
	| {
			v: number;
			id: string;
			ok: false;
			error: { code: string; message: string };
	  };
