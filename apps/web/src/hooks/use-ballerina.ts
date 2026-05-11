import * as React from "react";

import { SnapshotFS } from "@/lib/fs/snapshot";
import { useFS } from "@/providers/fs-provider";
import { BallerinaWorkerClient } from "@/workers/ballerina-worker-client";
import type { WorkerRunResult } from "@/workers/ballerina-worker-protocol";

export type UseBallerinaReturn = {
	isReady: boolean;
	progress: number;
	run: (path: string) => Promise<WorkerRunResult | null>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveWasmUrl(): string {
	return new URL(
		"ballerina.wasm",
		new URL(import.meta.env.BASE_URL, window.location.origin),
	).toString();
}

export function useBallerina(): UseBallerinaReturn {
	const fs = useFS();
	const clientRef = React.useRef<BallerinaWorkerClient | null>(null);
	const [isReady, setIsReady] = React.useState(false);
	const [progress, setProgress] = React.useState(0);

	React.useEffect(() => {
		let cancelled = false;

		const client = new BallerinaWorkerClient({
			onProgress: (_id, value) => {
				if (!cancelled) {
					setProgress(value);
				}
			},
		});
		clientRef.current = client;

		client
			.init(resolveWasmUrl())
			.then(() => {
				if (!cancelled) {
					setProgress(100);
					setIsReady(true);
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					setIsReady(false);
					console.error(error);
				}
			});

		return () => {
			cancelled = true;
			client.terminate();
			clientRef.current = null;
		};
	}, []);

	const run = React.useCallback(
		async (path: string): Promise<WorkerRunResult | null> => {
			if (!isReady || !clientRef.current) {
				return { output: "", error: "Ballerina runtime is not ready" };
			}

			if (!fs) {
				return { output: "", error: "Virtual file system is not available" };
			}

			try {
				const snapshot = await SnapshotFS.from(fs, path);
				return await clientRef.current.run(path, snapshot.serialize());
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unexpected error";
				return { output: "", error: message };
			}
		},
		[isReady, fs],
	);

	return { isReady, progress, run };
}
