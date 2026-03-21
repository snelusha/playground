import * as React from "react";

import { useNavigate, useSearch } from "@tanstack/react-router";

import { decodeShareToken } from "@/lib/share/decode-share-link";
import type { ShareSearch } from "@/lib/share/share-search";

import { useFileTreeStore } from "@/stores/file-tree-store";

export function ShareLinkHandler({ children }: React.PropsWithChildren) {
	const navigate = useNavigate();
	const { share: shareToken } = useSearch({
		from: "/$",
	}) as ShareSearch;
	const ready = useFileTreeStore((s) => s.ready);

	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		if (!ready || !shareToken) return;

		let cancelled = false;

		(async () => {
			setError(null);
			const payload = await decodeShareToken(shareToken);
			if (cancelled) return;

			if (!payload) {
				setError("This share link is invalid or corrupted.");
				navigate({
					to: "/$",
					search: { share: undefined },
					replace: true,
				});
				return;
			}

			const ok = useFileTreeStore.getState().applySharedImport(payload);
			if (cancelled) return;

			if (!ok) {
				setError("Could not load shared content.");
				navigate({
					to: "/$",
					search: { share: undefined },
					replace: true,
				});
				return;
			}

			const path = useFileTreeStore.getState().activeFile?.path;
			if (!path) return;

			const splat = path.startsWith("/") ? path.slice(1) : path;
			navigate({
				to: "/$",
				params: { _splat: splat },
				search: { share: undefined },
				replace: true,
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [ready, shareToken, navigate]);

	return (
		<>
			{error ? (
				<div
					role="alert"
					className="border-b border-destructive/40 bg-destructive/10 px-4 py-3 text-center text-sm text-destructive"
				>
					{error}
				</div>
			) : null}
			{children}
		</>
	);
}
