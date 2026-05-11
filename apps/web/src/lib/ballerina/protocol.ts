import type { ProjectSnapshot } from "@/lib/fs/project-snapshot";

/** Serialized LSP diagnostic objects produced by the WASM toolchain. */
export type WasmDiagnostic = Record<string, unknown>;

export type RunOutcome = { error?: string } | null;

export type ConsoleLevel = "log" | "error";

/** Main thread → worker */
export type BallerinaWorkerRequest =
	| {
			type: "getDiagnostics";
			requestId: number;
			snapshot: ProjectSnapshot;
			targetPath: string;
	  }
	| {
			type: "run";
			requestId: number;
			snapshot: ProjectSnapshot;
			targetPath: string;
	  };

/** Worker → main thread */
export type BallerinaWorkerResponse =
	| { type: "ready" }
	| { type: "bootError"; error: string }
	| { type: "loadProgress"; pct: number }
	| { type: "log"; line: string; level: ConsoleLevel }
	| {
			type: "getDiagnosticsResult";
			requestId: number;
			ok: true;
			diagnostics: WasmDiagnostic[] | null;
	  }
	| {
			type: "getDiagnosticsResult";
			requestId: number;
			ok: false;
			error: string;
	  }
	| {
			type: "runResult";
			requestId: number;
			ok: true;
			result: RunOutcome;
	  }
	| { type: "runResult"; requestId: number; ok: false; error: string };
