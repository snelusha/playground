import * as React from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";

import { toast } from "sonner";

import { decodeSharePayload, omitSearchParam } from "@/lib/share";

import { useFileTreeActions, useFileTreeStore } from "@/stores/file-tree-store";

import { useShareNotice } from "@/hooks/use-share-notice";

export function useShare() {
	const navigate = useNavigate({ from: "/$" });

	const { share } = useSearch({ from: "/$" }) as { share?: string };

	const { show: showNotice, ...shareNotice } = useShareNotice();

	const processed = React.useRef<string | null>(null);

	const ready = useFileTreeStore((s) => s.ready);
	const { loadSharedFiles } = useFileTreeActions();

	const dropShareParam = React.useCallback(() => {
		navigate({
			search: (prev) =>
				omitSearchParam(prev as Record<string, unknown>, "share"),
			replace: true,
		});
	}, [navigate]);

	React.useEffect(() => {
		if (!ready || !share) {
			processed.current = null;
			return;
		}

		if (processed.current === share) return;

		decodeSharePayload(share).then((payload) => {
			if (!payload) {
				processed.current = null;
				toast.error("Invalid share link");
				dropShareParam();
				return;
			}

			const loaded = loadSharedFiles(payload.root, payload.openRelativePath);
			processed.current = loaded ? share : null;
			if (!loaded) toast.error("Could not load shared files");
			else showNotice();

			dropShareParam();
		});
	}, [ready, share, loadSharedFiles, dropShareParam, showNotice]);

	const isProcessingShare = !!share && processed.current !== share;

	return {
		isProcessingShare,
		shareNotice,
	};
}
