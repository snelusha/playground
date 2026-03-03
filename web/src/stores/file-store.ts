import { create } from "zustand";

import { BrowserFS } from "@/lib/browser-fs";
import {
    addNode,
    allPaths,
    deleteNode,
    getNode,
    pathsUnder,
    updateNode,
} from "@/lib/tree";
import { addNodeToFs, remove, writeFile } from "@/lib/fs";

import type { FileNode, FilePath } from "@/types/files";

export type FileState = {
    tree: FileNode[];
    selectedFilePath: FilePath | null;
    selectedFile: Extract<FileNode, { kind: "file" }> | null;
};

export type FileActions = {
    setTree: (tree: FileNode[]) => void;

    selectFile: (path: FilePath | null) => void;
    updateFile: (path: FilePath, content: string) => void;

    addNode: (parentPath: FilePath | null, node: FileNode) => void;
    deleteNode: (path: FilePath) => void;
};

const fs = BrowserFS.getInstance();

export const useFileStore = create<FileState & FileActions>((set) => ({
    tree: fs.transformToTree() || [],
    selectedFilePath: "main.bal",
    selectedFile: null,

    setTree: (tree) => set({ tree }),

    selectFile: (path) =>
        set((state) => {
            const node = path ? getNode(state.tree, path) : null;
            if (!node || node.kind !== "file")
                return { selectedFilePath: path, selectedFile: null };
            return { selectedFilePath: path, selectedFile: node };
        }),
    updateFile: (path, content) => {
        writeFile(fs, path, content);
        set((state) => ({
            tree: updateNode(state.tree, path, (node) =>
                node.kind === "file" ? { ...node, content } : node,
            ),
        }));
    },

    addNode: (parentPath, node) => {
        addNodeToFs(fs, parentPath, node);
        set((state) => ({ tree: addNode(state.tree, parentPath, node) }));
    },
    deleteNode: (path) => {
        set((state) => {
            pathsUnder(state.tree, path)
                .reverse()
                .forEach((path) => remove(fs, path));
            const paths = allPaths(state.tree);

            return {
                tree: deleteNode(state.tree, path),
                selectedFilePath:
                    state.selectedFilePath === path
                        ? (paths[0] ?? null)
                        : state.selectedFilePath,
            };
        });
    },
}));
