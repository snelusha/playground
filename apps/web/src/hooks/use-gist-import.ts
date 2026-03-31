import * as React from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";

import { toast } from "sonner";

import { omitSearchParam } from "@/lib/share";
import { importGistToFileNodeTree } from "@/lib/gist-import";

import { useFileTreeActions, useFileTreeStore } from "@/stores/file-tree-store";

export function useGistImport() {
	const navigate = useNavigate({ from: "/$" });
	const { gist } = useSearch({ from: "/$" }) as { gist?: string };

	const processed = React.useRef<string | null>(null);

	const ready = useFileTreeStore((s) => s.ready);
	const { loadSharedFiles, openFile } = useFileTreeActions();

	const dropGistParam = React.useCallback(() => {
		navigate({
			search: (prev) =>
				omitSearchParam(prev as Record<string, unknown>, "gist"),
			replace: true,
		});
	}, [navigate]);

	React.useEffect(() => {
		if (!ready || !gist) {
			processed.current = null;
			return;
		}

		if (processed.current === gist) return;

		let cancelled = false;

		importGistToFileNodeTree(gist)
			.then((result) => {
				if (cancelled) return;

				const { loaded, openPath } = loadSharedFiles(result.root);
				processed.current = loaded ? gist : null;
				if (!loaded) toast.error("Could not import gist");
				else if (openPath !== null) openFile(openPath);

				dropGistParam();
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				processed.current = null;
				const message =
					err instanceof Error && err.message
						? err.message
						: "Could not import gist";
				toast.error(message);
				dropGistParam();
			});

		return () => {
			cancelled = true;
		};
	}, [ready, gist, loadSharedFiles, openFile, dropGistParam]);

	const isProcessingGist = !!gist && processed.current !== gist;

	return { isProcessingGist };
}
