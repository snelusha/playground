import * as React from "react";

import { useParams, useNavigate } from "@tanstack/react-router";

import { useFileTreeStore, useFileTreeActions } from "@/stores/file-tree-store";

import { NotFound } from "@/components/not-found";

const DEFAULT_FILE = "/tmp/01-orders.bal";
const DEFAULT_SPLAT = "tmp/01-orders.bal";

function toFilePath(splat: string | undefined): string | null {
	if (splat === undefined || splat === null) return null;
	const trimmed = String(splat).trim();
	if (!trimmed) return null;
	return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function toSplat(filePath: string): string {
	const p = filePath.startsWith("/") ? filePath.slice(1) : filePath;
	return p || DEFAULT_SPLAT;
}

export function FileRouteSync({ children }: React.PropsWithChildren) {
	const params = useParams({ strict: false }) as { _splat?: string };
	const navigate = useNavigate();

	const { openFile } = useFileTreeActions();
	const activeFilePath = useFileTreeStore((s) => s.activeFile?.path ?? null);
	const ready = useFileTreeStore((s) => s.ready);

	const [notFoundPath, setNotFoundPath] = React.useState<string | null>(null);

	const splat = params._splat;
	const filePathFromUrl = toFilePath(splat);

	React.useEffect(() => {
		if (!ready) return;

		if (!filePathFromUrl) {
			const ok = openFile(DEFAULT_FILE);
			if (ok) {
				navigate({ to: "/$", params: { _splat: DEFAULT_SPLAT }, replace: true });
			}
			return;
		}

		const ok = openFile(filePathFromUrl);
		if (!ok) {
			setNotFoundPath(filePathFromUrl);
		} else {
			setNotFoundPath(null);
		}
	}, [ready, filePathFromUrl, openFile, navigate]);

	React.useEffect(() => {
		if (!ready || !activeFilePath || notFoundPath) return;

		const targetSplat = toSplat(activeFilePath);
		if (targetSplat !== (splat ?? "")) {
			navigate({
				to: "/$",
				params: { _splat: targetSplat },
				replace: false,
			});
		}
	}, [ready, activeFilePath, notFoundPath, splat, navigate]);

	if (notFoundPath) {
		return <NotFound path={notFoundPath} />;
	}

	return <>{children}</>;
}
