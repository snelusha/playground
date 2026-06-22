import type { SnapshotFS } from "@/lib/fs/snapshot";

export type RunOutputStream = "stdout" | "stderr";

export interface RunOutput {
	stream: RunOutputStream;
	text: string;
}

export type RunOutputCallback = (output: RunOutput) => void;

export type RuntimeSignal = "graceful" | "immediate";

export interface HttpDispatchRequest {
	method?: string;
	host?: string;
	path?: string;
	query?: string;
	headers?: Record<string, string | string[]>;
	body?: string;
}

export interface HttpDispatchResponse {
	statusCode: number;
	headers: Record<string, string[]>;
	body: string;
}

export interface BallerinaWorkerAPI {
	init(wasmUrl: string, onProgress: (progress: number) => void): Promise<void>;
	run(
		snapshot: SnapshotFS,
		path: string,
		onOutput: RunOutputCallback,
	): Promise<void>;
	sendStopSignal(signal: RuntimeSignal): Promise<boolean>;
	dispatchHttpRequest(
		request: HttpDispatchRequest,
	): Promise<HttpDispatchResponse>;
	getDiagnostics(
		snapshot: SnapshotFS,
		path: string,
	): Promise<Array<Record<string, unknown>>>;
}
