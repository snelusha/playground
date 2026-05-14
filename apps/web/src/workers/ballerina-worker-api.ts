import type { SnapshotFS } from "@/lib/fs/snapshot";

export interface RunResult {
	stdout?: string;
	stderr?: string;
}

export interface BallerinaWorkerAPI {
	init(wasmUrl: string, onProgress: (progress: number) => void): Promise<void>;
	run(snapshot: SnapshotFS, path: string): Promise<RunResult>;
	getDiagnostics(
		snapshot: SnapshotFS,
		path: string,
	): Promise<Array<Record<string, unknown>>>;
}
