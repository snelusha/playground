import type { SnapshotFS } from "@/lib/fs/snapshot";

export type RunOutputStream = "stdout" | "stderr";

export interface RunOutput {
	stream: RunOutputStream;
	text: string;
}

export type RunOutputCallback = (output: RunOutput) => void;

export type RuntimeSignal = "graceful" | "immediate";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpServiceResponse {
	status: number;
	headers: Record<string, string>;
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
	invokeHttpService(
		method: HttpMethod,
		path: string,
		port: number,
		body?: string,
	): Promise<HttpServiceResponse>;
	getDiagnostics(
		snapshot: SnapshotFS,
		path: string,
	): Promise<Array<Record<string, unknown>>>;
}
