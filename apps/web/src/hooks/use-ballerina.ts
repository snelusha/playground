import "@/wasm_exec";

import * as React from "react";

import { SnapshotFS } from "@/lib/fs/snapshot";

import { useFS } from "@/providers/fs-provider";
import { useFileTreeStore } from "@/stores/file-tree-store";

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

			let mutationSync = Promise.resolve();
			const unsubscribe = snapshot.onMutation((mutation) => {
				mutationSync = mutationSync
					// Keep the mutation queue alive even if the previous sync failed.
					.catch(() => undefined)
					.then(async () => {
						try {
							await useFileTreeStore.getState().applyMutation(mutation);
						} catch (error) {
							onOutput({
								stream: "stderr",
								text: `Failed to sync file system mutation: ${String(error)}\n`,
							});
						}
					});
			});

			try {
				await clientRef.current.run(snapshot, path, onOutput);
				await mutationSync;
			} finally {
				unsubscribe();
			}
		},
		[fs],
	);

	return { isReady, progress, run };
}
