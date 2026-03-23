import * as React from "react";

import { useParams, useNavigate } from "@tanstack/react-router";

import { useFileTreeStore, useFileTreeActions } from "@/stores/file-tree-store";

import { useShare } from "@/hooks/use-share";

const DEFAULT_FILE = "/tmp/examples/01-orders.bal";
const DEFAULT_SPLAT = DEFAULT_FILE.replace(/^\/+/, "");

function normalizeSplat(splat: string | undefined) {
	if (!splat) return null;
	const trimmed = splat.trim();
	if (!trimmed) return null;
	return trimmed.replace(/^\/+/, "");
}

function filePathFromSplat(splat: string | undefined) {
	const normalized = normalizeSplat(splat);
	if (!normalized) return null;
	return `/${normalized}`;
}

function splatFromFilePath(filePath: string) {
	const trimmed = filePath.trim();
	if (!trimmed) return DEFAULT_SPLAT;
	const splat = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
	return splat || DEFAULT_SPLAT;
}

export function FileRouteSync({ children }: React.PropsWithChildren) {
	const params = useParams({ strict: false }) as { _splat?: string };

	const navigate = useNavigate({ from: "/$" });

	const ready = useFileTreeStore((s) => s.ready);
	const activeFilePath = useFileTreeStore((s) => s.activeFile?.path ?? null);
	const { openFile, existsFile } = useFileTreeActions();

	const { isProcessingShare } = useShare();

	const splat = params._splat;

	const currentSplat = React.useMemo(
		() => normalizeSplat(splat) ?? "",
		[splat],
	);
	const filePathFromUrl = React.useMemo(
		() => filePathFromSplat(splat),
		[splat],
	);
	const targetSplat = React.useMemo(
		() => (activeFilePath ? splatFromFilePath(activeFilePath) : null),
		[activeFilePath],
	);

	const openDefaultFileAndSyncRoute = React.useCallback(() => {
		if (existsFile(DEFAULT_FILE)) {
			openFile(DEFAULT_FILE);
			navigate({
				to: "/$",
				params: { _splat: DEFAULT_SPLAT },
				replace: true,
			});
		}
	}, [openFile, existsFile, navigate]);

	React.useEffect(() => {
		if (!ready || isProcessingShare) return;

		if (!filePathFromUrl) {
			if (activeFilePath && existsFile(activeFilePath)) return;
			openDefaultFileAndSyncRoute();
			return;
		}

		if (existsFile(filePathFromUrl)) openFile(filePathFromUrl);
		else openDefaultFileAndSyncRoute();
	}, [
		ready,
		isProcessingShare,
		filePathFromUrl,
		activeFilePath,
		existsFile,
		openFile,
		openDefaultFileAndSyncRoute,
	]);

	React.useEffect(() => {
		if (!ready || !activeFilePath || !targetSplat) return;
		if (targetSplat !== currentSplat) {
			navigate({
				to: "/$",
				params: { _splat: targetSplat },
				replace: true,
			});
		}
	}, [ready, activeFilePath, targetSplat, currentSplat, navigate]);

	return children;
}
