import * as React from "react";

import { toast } from "sonner";

import { EphemeralFS } from "@/lib/fs/ephemeral-fs";
import { LayeredFS } from "@/lib/fs/layered-fs";
import { RemoteFS } from "@/lib/fs/remote/remote-fs";

import { useFileTreeStore } from "@/stores/file-tree-store";

import EXAMPLES from "@/assets/examples.json";

import type { FileNode } from "@/lib/fs/core/file-node.types";

function createFS(): LayeredFS {
	const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
	const remoteFsUrl =
		import.meta.env.VITE_REMOTE_FS_WS_URL ??
		`${wsProtocol}://${window.location.hostname}:8787/fs`;

	return new LayeredFS(
		new EphemeralFS(EXAMPLES as FileNode[]),
		new RemoteFS({ url: remoteFsUrl }),
	);
}

export const FSContext = React.createContext<LayeredFS | null>(null);

export function FSProvider({ children }: React.PropsWithChildren) {
	const fs = React.useRef<LayeredFS>(null);

	const init = useFileTreeStore((s) => s.init);

	if (!fs.current) fs.current = createFS();

	React.useEffect(() => {
		if (fs.current) {
			void init(fs.current).catch(() =>
				toast.error("Failed to initialize file system"),
			);
		}
	}, [init]);

	return <FSContext.Provider value={fs.current}>{children}</FSContext.Provider>;
}

export const useFS = (): LayeredFS => {
	const fs = React.useContext(FSContext);
	if (!fs) throw new Error("useFS must be used within a FSProvider");
	return fs;
};
