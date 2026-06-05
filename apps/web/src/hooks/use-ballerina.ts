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
			let appliedMutationCount = 0;
			let mutationSync = Promise.resolve();
			snapshot.setMutationListener((mutation) => {
				appliedMutationCount += 1;
				mutationSync = mutationSync.then(() =>
					useFileTreeStore.getState().applyRuntimeMutations([mutation]),
				);
			});

			try {
				await clientRef.current.run(snapshot, path, onOutput);
			} finally {
				snapshot.setMutationListener(null);
				await mutationSync;

				const missedMutations = snapshot
					.getMutations()
					.slice(appliedMutationCount);
				if (missedMutations.length > 0) {
					await useFileTreeStore
						.getState()
						.applyRuntimeMutations(missedMutations);
				}
			}
		},
		[fs],
	);

	return { isReady, progress, run };
}
