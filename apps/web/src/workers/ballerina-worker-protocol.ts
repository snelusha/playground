export type SnapshotEntry =
	| {
			path: string;
			kind: "dir";
			modTime: number;
	  }
	| {
			path: string;
			kind: "file";
			content: string;
			modTime: number;
	  };

export type FsSnapshot = {
	rootPath: string;
	targetPath: string;
	entries: SnapshotEntry[];
};

export type WorkerRequest =
	| {
			requestId: number;
			type: "init";
			payload: {
				wasmUrl: string;
			};
	  }
	| {
			requestId: number;
			type: "run";
			payload: {
				targetPath: string;
				snapshot: FsSnapshot;
			};
	  }
	| {
			requestId: number;
			type: "getDiagnostics";
			payload: {
				targetPath: string;
				snapshot: FsSnapshot;
			};
	  };

export type WorkerResultMap = {
	init: { ready: true };
	run: { error?: string; output: string } | null;
	getDiagnostics: Array<Record<string, unknown>> | null;
};

export type WorkerResponse =
	| {
			requestId: number;
			type: "progress";
			payload: { percent: number };
	  }
	| {
			requestId: number;
			type: "success";
			payload: unknown;
	  }
	| {
			requestId: number;
			type: "error";
			payload: {
				message: string;
				stack?: string;
			};
	  };
