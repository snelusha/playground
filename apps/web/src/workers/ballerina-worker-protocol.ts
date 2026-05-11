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

export type BallerinaWorkerResults = {
	run: { error?: string; output: string } | null;
	getDiagnostics: Array<Record<string, unknown>> | null;
};

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
