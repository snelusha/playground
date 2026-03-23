import * as React from "react";

import { useParams, useNavigate } from "@tanstack/react-router";

import {
	useFileTreeActions,
	useFileTreeStore,
	useActiveFilePath,
} from "@/stores/file-tree-store";

import { useShare } from "@/hooks/use-share";

const DEFAULT_FILE = "/tmp/examples/01-orders.bal";
const DEFAULT_SPLAT = DEFAULT_FILE.replace(/^\/+/, "");

function normalizeSplat(splat: string | undefined): string | null {
	const trimmed = splat?.trim();
	return trimmed ? trimmed.replace(/^\/+/, "") : null;
}

function filePathFromSplat(splat: string | undefined): string | null {
	const normalized = normalizeSplat(splat);
	return normalized ? `/${normalized}` : null;
}

function splatFromFilePath(filePath: string): string {
	const trimmed = filePath.trim();
	const splat = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
	return splat || DEFAULT_SPLAT;
}

export function FileRouteSync({ children }: React.PropsWithChildren) {
	const { _splat: splat } = useParams({ strict: false }) as { _splat?: string };
	const navigate = useNavigate({ from: "/$" });

	const { isProcessingShare } = useShare();

	const ready = useFileTreeStore((s) => s.ready);
	const activeFilePath = useActiveFilePath();
	const { openFile, existsFile } = useFileTreeActions();

	const currentSplat = normalizeSplat(splat) ?? "";
	const filePathFromUrl = filePathFromSplat(splat);
	const targetSplat = activeFilePath ? splatFromFilePath(activeFilePath) : null;

	const activeFilePathRef = React.useRef(activeFilePath);
	const skipNextDefaultOpenRef = React.useRef(false);
	React.useLayoutEffect(() => {
		activeFilePathRef.current = activeFilePath;
	});

	const openDefaultFileAndSyncRoute = React.useCallback(() => {
		if (existsFile(DEFAULT_FILE)) {
			openFile(DEFAULT_FILE);
			navigate({ to: "/$", params: { _splat: DEFAULT_SPLAT }, replace: true });
		}
	}, [existsFile, openFile, navigate]);

	React.useEffect(() => {
		if (!ready || isProcessingShare) return;

		const currentActiveFilePath = activeFilePathRef.current;

		if (!filePathFromUrl) {
			if (skipNextDefaultOpenRef.current) {
				skipNextDefaultOpenRef.current = false;
				return;
			}
			if (currentActiveFilePath && existsFile(currentActiveFilePath)) return;
			openDefaultFileAndSyncRoute();
			return;
		}

		if (filePathFromUrl === currentActiveFilePath) return;

		if (existsFile(filePathFromUrl)) {
			openFile(filePathFromUrl);
			return;
		}

		openDefaultFileAndSyncRoute();
	}, [
		ready,
		isProcessingShare,
		filePathFromUrl,
		existsFile,
		openFile,
		openDefaultFileAndSyncRoute,
	]);

	React.useEffect(() => {
		if (!ready || isProcessingShare) return;
		if (activeFilePath) return;
		if (!currentSplat) return;

		skipNextDefaultOpenRef.current = true;
		navigate({ to: "/$", params: { _splat: "" }, replace: true });
	}, [ready, isProcessingShare, activeFilePath, currentSplat, navigate]);

	React.useEffect(() => {
		if (!ready || !activeFilePath || !targetSplat) return;
		if (targetSplat !== currentSplat) {
			navigate({ to: "/$", params: { _splat: targetSplat }, replace: true });
		}
	}, [ready, activeFilePath, targetSplat, currentSplat, navigate]);

	return children;
}
