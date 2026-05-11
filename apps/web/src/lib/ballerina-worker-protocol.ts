import type { SerializedFSNode } from "@/lib/fs/snapshot-fs";

export type BallerinaDiagnostic = Record<string, unknown>;

export type BallerinaRunResult = {
	error?: string;
	output: string;
};

export type BallerinaWorkerRequest =
	| {
			type: "load";
			id: number;
	  }
	| {
			type: "diagnostics";
			id: number;
			fs: SerializedFSNode;
			targetPath: string;
	  }
	| {
			type: "run";
			id: number;
			fs: SerializedFSNode;
			targetPath: string;
	  };

export type BallerinaWorkerResponse =
	| {
			type: "load";
			id: number;
	  }
	| {
			type: "progress";
			id: number;
			progress: number;
	  }
	| {
			type: "diagnostics";
			id: number;
			diagnostics: BallerinaDiagnostic[];
	  }
	| {
			type: "run";
			id: number;
			result: BallerinaRunResult;
	  }
	| {
			type: "error";
			id: number;
			error: string;
	  };
