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

/** Return types for methods exposed from the Ballerina worker (via Comlink). */
export type BallerinaWorkerResults = {
	run: { error?: string; output: string } | null;
	getDiagnostics: Array<Record<string, unknown>> | null;
};

/** RPC surface exposed with `Comlink.expose` from `ballerina.worker.ts`. */
export interface BallerinaWorkerApi {
	init(wasmUrl: string, onProgress?: (percent: number) => void): Promise<void>;
	run(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<BallerinaWorkerResults["run"]>;
	getDiagnostics(input: {
		targetPath: string;
		snapshot: FsSnapshot;
	}): Promise<BallerinaWorkerResults["getDiagnostics"]>;
}
