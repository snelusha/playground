import { useFileTreeStore } from "@/lib/fs/file-store.store";

/**
 * Fine-grained selector hooks.
 * Always prefer these over importing the full store to minimise re-renders.
 * No fs argument needed anywhere — it's bound inside the store closure.
 */

// ------------------------------------------------------------------ trees

export const useExamplesTree = () => useFileTreeStore((s) => s.examplesTree);

export const useWorkspaceTree = () => useFileTreeStore((s) => s.workspaceTree);

// ------------------------------------------------------------------ active file

export const useActiveFile = () => useFileTreeStore((s) => s.activeFile);

export const useActiveFilePath = () =>
    useFileTreeStore((s) => s.activeFile?.path ?? null);

export const useActiveFileContent = () =>
    useFileTreeStore((s) => s.activeFile?.content ?? "");

export const useIsDirty = () =>
    useFileTreeStore((s) => s.activeFile?.dirty ?? false);

// ------------------------------------------------------------------ dir expansion

export const useIsDirExpanded = (path: string) =>
    useFileTreeStore((s) => s.expandedPaths.has(path));

// ------------------------------------------------------------------ ready

export const useIsFSReady = () => useFileTreeStore((s) => s.ready);

// ------------------------------------------------------------------ actions
// (kept for future use, but currently unused by the sample page)

export const useFileTreeActions = () => useFileTreeStore((s) => s);
