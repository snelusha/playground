import * as React from "react";

import { ShareNoticeDialog } from "@/components/share-notice-dialog";

import { useParams, useNavigate } from "@tanstack/react-router";

import {
	useFileTreeActions,
	useFileTreeStore,
	useActiveFilePath,
	useLocalTree,
} from "@/stores/file-tree-store";

import { useShare } from "@/hooks/use-share";
import { IS_REMOTE_FS } from "@/lib/fs/backend-mode";
import { LOCAL_ROOT } from "@/lib/fs/fs-roots";

const DEFAULT_FILE = "/tmp/examples/01-response-aggregator/main.bal";
const DEFAULT_SPLAT = DEFAULT_FILE.replace(/^\/+/, "");

function firstLocalFilePath(
	nodes: Array<{ kind: string; name: string; children?: unknown }>,
	parentPath: string,
): string | null {
	for (const node of nodes) {
		if (node.kind === "file") return `${parentPath}/${node.name}`;
		if (node.kind === "dir" && Array.isArray(node.children)) {
			const nested = firstLocalFilePath(
				node.children as Array<{
					kind: string;
					name: string;
					children?: unknown;
				}>,
				`${parentPath}/${node.name}`,
			);
			if (nested) return nested;
		}
	}
	return null;
}

function normalizeSplat(splat: string | undefined): string | null {
	const trimmed = splat?.trim();
	return trimmed ? trimmed.replace(/^\/+/, "") : null;
}

function filePathCandidatesFromSplat(splat: string | undefined): string[] {
	const normalized = normalizeSplat(splat);
	if (!normalized) return [];
	const directPath = `/${normalized}`;
	if (IS_REMOTE_FS) return [directPath];

	// In local-storage mode, URL is user-facing (without /local), but FS paths live under /local.
	const localPath = `${LOCAL_ROOT}/${normalized}`;
	if (normalized.startsWith(`${LOCAL_ROOT.slice(1)}/`)) return [directPath];
	return [localPath, directPath];
}

async function firstExistingCandidate(
	candidates: string[],
	existsFile: (path: string) => Promise<boolean>,
): Promise<string | null> {
	for (const candidatePath of candidates) {
		if (await existsFile(candidatePath)) return candidatePath;
	}
	return null;
}

async function resolveCandidateWithRetry(
	candidates: string[],
	existsFile: (path: string) => Promise<boolean>,
	shouldCancel: () => boolean,
	attempts: number,
	delayMs: number,
): Promise<string | null> {
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		if (shouldCancel()) return null;
		const match = await firstExistingCandidate(candidates, existsFile);
		if (match) return match;
		if (attempt < attempts - 1) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}
	return null;
}

function splatFromFilePath(filePath: string): string {
	let splat = filePath.startsWith("/") ? filePath.slice(1) : filePath;
	if (!IS_REMOTE_FS && splat.startsWith(`${LOCAL_ROOT.slice(1)}/`)) {
		splat = splat.slice(LOCAL_ROOT.length);
		if (splat.startsWith("/")) splat = splat.slice(1);
	}
	return splat || DEFAULT_SPLAT;
}

export function FileRouteSync({ children }: React.PropsWithChildren) {
	const { _splat: splat } = useParams({ strict: false }) as { _splat?: string };
	const navigate = useNavigate({ from: "/$" });

	const { isProcessingShare, shareNotice } = useShare();

	const ready = useFileTreeStore((s) => s.ready);
	const localTree = useLocalTree();
	const activeFilePath = useActiveFilePath();
	const { openFile, existsFile } = useFileTreeActions();

	const currentSplat = normalizeSplat(splat) ?? "";
	const filePathCandidates = filePathCandidatesFromSplat(splat);
	const hasExplicitFileInUrl = filePathCandidates.length > 0;

	const activeFilePathRef = React.useRef(activeFilePath);
	React.useLayoutEffect(() => {
		activeFilePathRef.current = activeFilePath;
	});

	const clearedByDeletionRef = React.useRef(false);

	React.useEffect(() => {
		if (!ready || isProcessingShare) return;
		let cancelled = false;

		const syncFileRoute = async () => {
			const filePathFromUrl = hasExplicitFileInUrl
				? await resolveCandidateWithRetry(
						filePathCandidates,
						existsFile,
						() => cancelled,
						10,
						150,
					)
				: await firstExistingCandidate(filePathCandidates, existsFile);
			if (cancelled) return;
			const activePath = activeFilePathRef.current;
			if (filePathFromUrl) {
				if (!cancelled && filePathFromUrl !== activePath)
					await openFile(filePathFromUrl);
				return;
			}
			// Keep URL stable if user explicitly requested a file path.
			// Avoid replacing it with a default/first-file path.
			if (hasExplicitFileInUrl) return;
			if (clearedByDeletionRef.current) {
				clearedByDeletionRef.current = false;
				return;
			}
			if (!activePath && !cancelled) {
				const localRoot = IS_REMOTE_FS ? "" : LOCAL_ROOT;
				const localDefault = firstLocalFilePath(localTree, localRoot);
				const fallback = IS_REMOTE_FS
					? (localDefault ?? DEFAULT_FILE)
					: DEFAULT_FILE;
				await openFile(fallback);
				if (cancelled) return;
				navigate({
					to: "/$",
					params: { _splat: splatFromFilePath(fallback) },
					replace: true,
				});
			}
		};
		void syncFileRoute();

		return () => {
			cancelled = true;
		};
	}, [
		ready,
		isProcessingShare,
		filePathCandidates,
		existsFile,
		openFile,
		localTree,
		hasExplicitFileInUrl,
		navigate,
	]);

	React.useEffect(() => {
		if (!ready || isProcessingShare) return;
		if (hasExplicitFileInUrl && !activeFilePath) return;

		const expectedSplat = activeFilePath
			? splatFromFilePath(activeFilePath)
			: "";

		if (expectedSplat !== currentSplat) {
			if (!activeFilePath) clearedByDeletionRef.current = true;
			navigate({ to: "/$", params: { _splat: expectedSplat }, replace: true });
		}
	}, [
		ready,
		isProcessingShare,
		activeFilePath,
		currentSplat,
		hasExplicitFileInUrl,
		navigate,
	]);

	return (
		<>
			{children}
			<ShareNoticeDialog
				open={shareNotice.open}
				onDismiss={shareNotice.dismiss}
				onDismissPermanently={shareNotice.dismissPermanently}
			/>
		</>
	);
}
