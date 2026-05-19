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
		async (path: string): Promise<{ error?: string } | null> => {
			if (!clientRef.current)
				return { error: "Ballerina runtime is not initialized" };
			if (!fs) return { error: "Virtual file system is not available" };

			const snapshot = await SnapshotFS.from(fs, path);
			const result = await clientRef.current.run(snapshot, path);
			if (result && typeof result === "object" && "error" in result) {
				return result as { error?: string };
			}
			// FIXME: We could get rid of this once we have WASM PAL
			if (result?.output) {
				console.log(result.output);
			} else if (result?.error) {
				return { error: result.error };
			}
			return null;
		},
		[fs],
	);

	return { isReady, progress, run };
}
