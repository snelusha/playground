import * as React from "react";

import { useParams, useNavigate, useSearch } from "@tanstack/react-router";

import { deserializeSharePayload } from "@/lib/share";
import { useFileTreeStore, useFileTreeActions } from "@/stores/file-tree-store";

const DEFAULT_FILE = "/tmp/01-orders.bal";
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
	const { share } = useSearch({ from: "/$", strict: false }) as {
		share?: string;
	};

	const ready = useFileTreeStore((s) => s.ready);
	const activeFilePath = useFileTreeStore((s) => s.activeFile?.path ?? null);
	const { openFile, existsFile, applySharedFileNodeToTemp } =
		useFileTreeActions();

	const shareProcessedRef = React.useRef<string | null>(null);

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

	const stripShareSearch = React.useCallback(() => {
		navigate({
			search: (prev) => {
				const { share: _removed, ...rest } = prev as Record<string, unknown>;
				return rest;
			},
			replace: true,
		});
	}, [navigate]);

	React.useEffect(() => {
		if (!ready) return;

		if (share) {
			if (shareProcessedRef.current === share) return;

			const payload = deserializeSharePayload(share);
			if (!payload) {
				stripShareSearch();
				return;
			}

			shareProcessedRef.current = share;

			const openPath = applySharedFileNodeToTemp(
				payload.root,
				payload.openRelativePath,
			);
			if (openPath) {
				openFile(openPath);
				navigate({
					to: "/$",
					params: { _splat: splatFromFilePath(openPath) },
					search: (prev) => {
						const { share: _removed, ...rest } = prev as Record<
							string,
							unknown
						>;
						return rest;
					},
					replace: true,
				});
			} else {
				shareProcessedRef.current = null;
				stripShareSearch();
				openDefaultFileAndSyncRoute();
			}
			return;
		}

		shareProcessedRef.current = null;

		if (!filePathFromUrl) {
			openDefaultFileAndSyncRoute();
			return;
		}

		if (existsFile(filePathFromUrl)) openFile(filePathFromUrl);
		else openDefaultFileAndSyncRoute();
	}, [
		ready,
		share,
		filePathFromUrl,
		existsFile,
		openFile,
		openDefaultFileAndSyncRoute,
		applySharedFileNodeToTemp,
		navigate,
		stripShareSearch,
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
