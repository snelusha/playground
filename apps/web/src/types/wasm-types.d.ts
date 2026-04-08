import type { FS } from "@/lib/fs/core/fs.interface";

export type WasmDiagnostic = {
	severity: string;
	code?: string;
	message: string;
	filePath?: string;
	startLine?: number;
	startCol?: number;
	endLine?: number;
	endCol?: number;
};

export type WasmRunResult =
	| {
			error?: string;
	  }
	| {
			diagnostics: WasmDiagnostic[];
			hasErrors: boolean;
	  }
	| null;

declare global {
	export interface Window {
		Go: any;
		run(proxy: FS, path: string): WasmRunResult;
	}
}
