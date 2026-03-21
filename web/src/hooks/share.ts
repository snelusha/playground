import * as React from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";

import { useFS } from "@/providers/fs-provider";

import { basename } from "@/lib/fs/core/path-utils";
import {
	buildSharePageUrl,
	decodeShareToken,
	encodeShareToken,
	enrichShareFromActiveEditor,
	type SharePayload,
	type ShareSearch,
} from "@/lib/share/share-link";

import { useFileTreeStore } from "@/stores/file-tree-store";

export function useShareLink() {
	const fs = useFS();

	const copyShareLink = React.useCallback(
		async (path: string) => {
			const root = fs.exportPathToFileNode(path);
			if (!root) return;

			const active = useFileTreeStore.getState().activeFile;
			const activeEditor = active?.path
				? { path: active.path, content: active.content }
				: null;

			const { root: mergedRoot, openRelativePath } =
				enrichShareFromActiveEditor(path, root, activeEditor);

			const payload: SharePayload = {
				v: 1,
				name: basename(path),
				root: mergedRoot,
				...(openRelativePath ? { openRelativePath } : {}),
			};

			try {
				const token = await encodeShareToken(payload);
				await navigator.clipboard.writeText(buildSharePageUrl(token));
			} catch {}
		},
		[fs],
	);

	return { copyShareLink };
}

/** Consumes `?share=` on load: imports into `/tmp/shared/...`, syncs route, or sets an error message. */
export function useShareImport(): string | null {
	const navigate = useNavigate();
	const { share: token } = useSearch({ from: "/$" }) as ShareSearch;
	const ready = useFileTreeStore((s) => s.ready);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!ready || !token) return;

		let cancelled = false;

		(async () => {
			setError(null);
			const payload = await decodeShareToken(token);
			if (cancelled) return;

			const clearShare = () =>
				navigate({
					to: "/$",
					search: { share: undefined },
					replace: true,
				});

			if (!payload) {
				setError("This share link is invalid or corrupted.");
				clearShare();
				return;
			}

			if (!useFileTreeStore.getState().applySharedImport(payload)) {
				setError("Could not load shared content.");
				clearShare();
				return;
			}

			const path = useFileTreeStore.getState().activeFile?.path;
			if (!path) return;

			navigate({
				to: "/$",
				params: { _splat: path.startsWith("/") ? path.slice(1) : path },
				search: { share: undefined },
				replace: true,
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [ready, token, navigate]);

	return error;
}
