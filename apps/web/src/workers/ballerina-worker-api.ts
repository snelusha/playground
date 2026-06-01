import type { SnapshotFS } from "@/lib/fs/snapshot";

export type RunOutputStream = "stdout" | "stderr";

export interface RunOutput {
	stream: RunOutputStream;
	text: string;
}

export type RunOutputCallback = (output: RunOutput) => void;

export type RuntimeSignal = "graceful" | "immediate";

export interface BallerinaWorkerAPI {
	init(wasmUrl: string, onProgress: (progress: number) => void): Promise<void>;
	run(
		snapshot: SnapshotFS,
		path: string,
		onOutput: RunOutputCallback,
	): Promise<void>;
	getDiagnostics(
		snapshot: SnapshotFS,
		path: string,
	): Promise<Array<Record<string, unknown>>>;
	sendSignal(signal: RuntimeSignal): Promise<boolean>;
}
