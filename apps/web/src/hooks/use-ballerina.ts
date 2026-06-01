import "@/wasm_exec";

import * as React from "react";

import { SnapshotFS } from "@/lib/fs/snapshot";

import type { SnapshotFileOverride } from "@/lib/fs/snapshot";

import { useFS } from "@/providers/fs-provider";

import { getBallerinaWorkerClient } from "@/workers/ballerina-worker-client";

import type { BallerinaWorkerClient } from "@/workers/ballerina-worker-client";
import type { RunOutputCallback } from "@/workers/ballerina-worker-api";

export function useBallerina() {
	const fs = useFS();

	const clientRef = React.useRef<BallerinaWorkerClient | null>(null);

	const [isReady, setIsReady] = React.useState(false);
	const [progress, setProgress] = React.useState(0);

	React.useEffect(() => {
		const client = getBallerinaWorkerClient();
		clientRef.current = client;

		client
			.init((p) => setProgress(p))
			.then(() => setIsReady(true))
			.catch(() => setIsReady(false));
	}, []);

	const run = React.useCallback(
		async (path: string, onOutput: RunOutputCallback): Promise<void> => {
			if (!clientRef.current) {
				onOutput({
					stream: "stderr",
					text: "Ballerina runtime is not initialized",
				});
				return;
			}
			if (!fs) {
				onOutput({
					stream: "stderr",
					text: "Virtual file system is not available",
				});
				return;
			}

			const snapshot = await SnapshotFS.from(fs, path);
			await clientRef.current.run(snapshot, path, onOutput);
		},
		[fs],
	);

	const getAST = React.useCallback(
		async (
			path: string,
			overrides: SnapshotFileOverride[] = [],
		): Promise<string> => {
			if (!clientRef.current) return "Ballerina runtime is not initialized\n";
			if (!fs) return "Virtual file system is not available\n";

			const snapshot = await SnapshotFS.from(fs, path, overrides);
			const ast = await clientRef.current.getAST(snapshot, path);
			return ast || "No AST output produced\n";
		},
		[fs],
	);

	return { isReady, progress, run, getAST };
}
