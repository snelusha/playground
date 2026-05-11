import type { SerializedSnapshot } from "@/lib/fs/snapshot";

// ---------------------------------------------------------------------------
// Requests (main thread → worker)
// ---------------------------------------------------------------------------

export type InitRequest = {
	readonly id: number;
	readonly type: "init";
	readonly wasmUrl: string;
};

export type RunRequest = {
	readonly id: number;
	readonly type: "run";
	readonly path: string;
	readonly snapshot: SerializedSnapshot;
};

export type DiagnosticsRequest = {
	readonly id: number;
	readonly type: "diagnostics";
	readonly path: string;
	readonly snapshot: SerializedSnapshot;
};

export type WorkerRequest = InitRequest | RunRequest | DiagnosticsRequest;

/** Non-null when the program produced output (even if it also errored). */
export type WorkerRunResult = {
	readonly output: string;
	readonly error?: string;
};

export type WorkerDiagnostic = Record<string, unknown>;

export type InitResponse =
	| { readonly id: number; readonly type: "init-result"; readonly ok: true }
	| {
			readonly id: number;
			readonly type: "init-result";
			readonly ok: false;
			readonly error: string;
	  };

export type RunResponse =
	| {
			readonly id: number;
			readonly type: "run-result";
			readonly ok: true;
			readonly result: WorkerRunResult | null;
	  }
	| {
			readonly id: number;
			readonly type: "run-result";
			readonly ok: false;
			readonly error: string;
	  };

export type DiagnosticsResponse =
	| {
			readonly id: number;
			readonly type: "diagnostics-result";
			readonly ok: true;
			readonly diagnostics: WorkerDiagnostic[] | null;
	  }
	| {
			readonly id: number;
			readonly type: "diagnostics-result";
			readonly ok: false;
			readonly error: string;
	  };

export type ProgressEvent = {
	readonly type: "progress";
	readonly id: number;
	readonly value: number;
};

export type WorkerResponse =
	| InitResponse
	| RunResponse
	| DiagnosticsResponse
	| ProgressEvent;
