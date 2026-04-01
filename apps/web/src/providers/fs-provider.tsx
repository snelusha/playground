import * as React from "react";

import { RemoteFS, WsTransport } from "@playground/remote-fs";

import { EphemeralFS } from "@/lib/fs/ephemeral-fs";
import { LocalStorageFS } from "@/lib/fs/local-storage-fs";
import { LayeredFS } from "@/lib/fs/layered-fs";
import { PlaygroundAsyncFS } from "@/lib/fs/playground-async-fs";
import { REMOTE_ROOT } from "@/lib/fs/fs-roots";

import { useFileTreeStore } from "@/stores/file-tree-store";

import EXAMPLES from "@/assets/examples.json";

import type { FileNode } from "@/lib/fs/core/file-node.types";
export type FSContextValue = {
	playground: PlaygroundAsyncFS;
	layered: LayeredFS;
};

function buildRemoteWsUrl(): string | undefined {
	const raw = import.meta.env.VITE_REMOTE_FS_WS_URL?.trim();
	if (!raw) return undefined;
	const token = import.meta.env.VITE_REMOTE_FS_AUTH_TOKEN?.trim();
	if (!token) return raw;
	const sep = raw.includes("?") ? "&" : "?";
	return `${raw}${sep}token=${encodeURIComponent(token)}`;
}

function createFSBundle(): {
	value: FSContextValue;
	disposeTransport: () => void;
} {
	const layered = new LayeredFS(
		new EphemeralFS(EXAMPLES as FileNode[]),
		new LocalStorageFS(),
	);
	const wsUrl = buildRemoteWsUrl();
	if (!wsUrl) {
		return {
			value: {
				layered,
				playground: new PlaygroundAsyncFS(layered, null),
			},
			disposeTransport: () => {},
		};
	}
	const transport = new WsTransport(wsUrl);
	const remote = new RemoteFS(transport);
	return {
		value: {
			layered,
			playground: new PlaygroundAsyncFS(layered, remote),
		},
		disposeTransport: () => transport.dispose(),
	};
}

export const FSContext = React.createContext<FSContextValue | null>(null);

export function FSProvider({ children }: React.PropsWithChildren) {
	const bundleRef = React.useRef<ReturnType<typeof createFSBundle> | null>(null);
	if (!bundleRef.current) bundleRef.current = createFSBundle();

	const init = useFileTreeStore((s) => s.init);

	React.useEffect(() => {
		const { playground } = bundleRef.current!.value;
		init(playground);
	}, [init]);

	React.useEffect(() => {
		const { playground } = bundleRef.current!.value;
		if (!playground.remoteEnabled()) return;
		const unsub = playground.watch(REMOTE_ROOT, () => {
			void useFileTreeStore.getState()._syncTrees();
		});
		return () => unsub();
	}, []);

	React.useEffect(() => {
		return () => bundleRef.current?.disposeTransport();
	}, []);

	return (
		<FSContext.Provider value={bundleRef.current.value}>
			{children}
		</FSContext.Provider>
	);
}

/** Synchronous virtual FS for WASM (`window.run`). */
export const useFS = (): LayeredFS => {
	const ctx = React.useContext(FSContext);
	if (!ctx) throw new Error("useFS must be used within a FSProvider");
	return ctx.layered;
};

/** Async unified FS (examples, local storage, optional remote). */
export const usePlaygroundFS = (): PlaygroundAsyncFS => {
	const ctx = React.useContext(FSContext);
	if (!ctx) throw new Error("usePlaygroundFS must be used within a FSProvider");
	return ctx.playground;
};
