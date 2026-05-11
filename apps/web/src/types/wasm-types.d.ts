import type { FsSnapshot } from "@/workers/ballerina-worker-protocol";

export type BallerinaRunResult = {
	error?: string;
	output?: string;
} | null;

export type BallerinaDiagnosticsResult = Array<Record<string, unknown>> | null;

export type BallerinaWorkerInput = {
	targetPath: string;
	snapshot: FsSnapshot;
};
