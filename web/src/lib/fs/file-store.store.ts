import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import { dirname, joinPath } from "@/lib/fs/core/path-utils";

import type { UnionFS } from "@/lib/fs/union-fs";
import type { FileNode } from "@/lib/fs/core/file-node.types";

export type ActiveFile = {
    /** Full path including namespace, e.g. "examples/hello-world/main.bal" */
    path: string;
    content: string;
    /** Whether the content differs from what's on disk */
    dirty: boolean;
};

type FileTreeState = {
    examplesTree: FileNode[];
    workspaceTree: FileNode[];
    activeFile: ActiveFile | null;
    expandedPaths: Set<string>;
    ready: boolean;
};

type FileTreeActions = {
    /** Called once by FSProvider — binds fs into all actions */
    init(fs: UnionFS): void;

    openFile(path: string): void;
    saveFile(): boolean;
    createFile(path: string): boolean;
    deleteFile(path: string): boolean;
    renameFile(oldPath: string, newPath: string): boolean;

    createDir(path: string): boolean;
    deleteDir(path: string): boolean;
    toggleDir(path: string): void;
    expandDir(path: string): void;

    setEditorContent(content: string): void;

    resetExample(path: string): void;
    resetAllExamples(): void;
    copyToWorkspace(examplePath: string): boolean;

    _syncTrees(): void;
};

// ------------------------------------------------------------------ store

export const useFileTreeStore = create<FileTreeState & FileTreeActions>()(
    immer((set, get) => {
        // fs lives in closure — set once by init(), never in Zustand state
        let fs: UnionFS | null = null;

        function getFS(): UnionFS {
            if (!fs)
                throw new Error(
                    "FileTreeStore: fs not initialised — call init() first",
                );
            return fs;
        }

        return {
            // -------------------------------------------- initial state
            examplesTree: [],
            workspaceTree: [],
            activeFile: null,
            expandedPaths: new Set(),
            ready: false,

            // -------------------------------------------- init
            init(instance) {
                if (fs) return; // already initialised
                fs = instance;
                set((s) => {
                    s.examplesTree = fs!.examplesTree();
                    s.workspaceTree = fs!.workspaceTree();
                    s.ready = true;
                });
            },

            // -------------------------------------------- file operations

            openFile(path) {
                const file = getFS().open(path);
                if (!file) return;
                set((s) => {
                    s.activeFile = {
                        path,
                        content: file.content,
                        dirty: false,
                    };
                    _expandParents(s, path);
                });
            },

            saveFile() {
                const { activeFile } = get();
                if (!activeFile || !activeFile.dirty) return false;
                const ok = getFS().writeFile(
                    activeFile.path,
                    activeFile.content,
                );
                if (!ok) return false;
                set((s) => {
                    if (s.activeFile) s.activeFile.dirty = false;
                });
                get()._syncTrees();
                return true;
            },

            createFile(path) {
                const ok = getFS().writeFile(path, "");
                if (!ok) return false;
                get()._syncTrees();
                get().openFile(path);
                return true;
            },

            deleteFile(path) {
                const ok = getFS().remove(path);
                if (!ok) return false;
                set((s) => {
                    if (s.activeFile?.path === path) s.activeFile = null;
                });
                get()._syncTrees();
                return true;
            },

            renameFile(oldPath, newPath) {
                const ok = getFS().move(oldPath, newPath);
                if (!ok) return false;
                set((s) => {
                    if (s.activeFile?.path === oldPath) {
                        s.activeFile.path = newPath;
                    }
                });
                get()._syncTrees();
                return true;
            },

            // -------------------------------------------- dir operations

            createDir(path) {
                const ok = getFS().mkdirAll(path);
                if (!ok) return false;
                get()._syncTrees();
                get().expandDir(path);
                return true;
            },

            deleteDir(path) {
                const ok = getFS().remove(path);
                if (!ok) return false;
                set((s) => {
                    if (s.activeFile?.path.startsWith(path + "/")) {
                        s.activeFile = null;
                    }
                    s.expandedPaths.delete(path);
                });
                get()._syncTrees();
                return true;
            },

            toggleDir(path) {
                set((s) => {
                    if (s.expandedPaths.has(path)) {
                        s.expandedPaths.delete(path);
                    } else {
                        s.expandedPaths.add(path);
                    }
                });
            },

            expandDir(path) {
                set((s) => {
                    s.expandedPaths.add(path);
                });
            },

            // -------------------------------------------- editor

            setEditorContent(content) {
                set((s) => {
                    if (!s.activeFile) return;
                    s.activeFile.content = content;
                    s.activeFile.dirty = true;
                });
            },

            // -------------------------------------------- example helpers

            resetExample(path) {
                const ok = getFS().resetExampleFile(path);
                if (!ok) return;
                if (get().activeFile?.path === path) get().openFile(path);
                get()._syncTrees();
            },

            resetAllExamples() {
                // const f = getFS();
                // f.resetExamples();
                // get()._syncTrees();
                // const { activeFile } = get();
                // if (activeFile && f.isExample(activeFile.path)) {
                //     get().openFile(activeFile.path);
                // }
            },

            copyToWorkspace(examplePath) {
                const segments = examplePath.split("/").slice(1);
                const workspacePath = joinPath("workspace", ...segments);
                const parentDir = dirname(workspacePath);
                if (parentDir) getFS().mkdirAll(parentDir);
                const ok = getFS().move(examplePath, workspacePath);
                if (!ok) return false;
                get()._syncTrees();
                get().openFile(workspacePath);
                return true;
            },

            // -------------------------------------------- internal

            _syncTrees() {
                const f = getFS();
                set((s) => {
                    s.examplesTree = f.examplesTree();
                    s.workspaceTree = f.workspaceTree();
                });
            },
        };
    }),
);

// ------------------------------------------------------------------ helpers

function _expandParents(
    s: Pick<FileTreeState, "expandedPaths">,
    path: string,
): void {
    const parts = path.split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
        s.expandedPaths.add(parts.slice(0, i).join("/"));
    }
}
