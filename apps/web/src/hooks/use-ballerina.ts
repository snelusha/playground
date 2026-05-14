import "@/wasm_exec";

import * as React from "react";

import { SnapshotFS } from "@/lib/fs/snapshot";

import { useFS } from "@/providers/fs-provider";

import { getBallerinaWorkerClient } from "@/workers/ballerina-worker-client";

import type { BallerinaWorkerClient } from "@/workers/ballerina-worker-client";

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
		async (path: string): Promise<{ stdout: string; stderr: string }> => {
			if (!clientRef.current)
				return { stdout: "", stderr: "Ballerina runtime is not initialized" };
			if (!fs)
				return { stdout: "", stderr: "Virtual file system is not available" };

			const snapshot = await SnapshotFS.from(fs, path);
			const result = await clientRef.current.run(snapshot, path);
			return {
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
			};
		},
		[fs],
	);

	return { isReady, progress, run };
}
