import * as React from "react";

import type { ConsoleLevel } from "@/lib/ballerina/protocol";
import { getBallerinaWorkerClient } from "@/lib/ballerina/worker-client";

import { useFS } from "@/providers/fs-provider";

import { collectProjectSnapshot } from "@/lib/fs/project-snapshot";

export function useBallerina() {
	const fs = useFS();
	const client = getBallerinaWorkerClient();

	const state = React.useSyncExternalStore(
		client.subscribe,
		client.getState,
		client.getState,
	);

	async function run(
		path: string,
		options?: { onLog?: (line: string, level: ConsoleLevel) => void },
	): Promise<{ error?: string } | null> {
		if (!state.ready) return { error: "Ballerina runtime is not ready" };
		if (!fs) return { error: "Virtual file system is not available" };

		const snapshot = await collectProjectSnapshot(fs, path);
		const result = await client.run(snapshot, path, options);
		if (result && typeof result === "object" && "error" in result) {
			return result as { error?: string };
		}
		return null;
	}

	return { isReady: state.ready, progress: state.progress, run };
}
