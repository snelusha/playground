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

    setTree: (tree) => set({ tree }),

    selectFile: (path) => set({ selectedFilePath: path }),
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

export function useSelectedFile(): Extract<FileNode, { kind: "file" }> | null {
    const tree = useFileStore((state) => state.tree);
    const path = useFileStore((state) => state.selectedFilePath);

    if (!path) return null;

    const node = getNode(tree, path);
    return node && node.kind === "file" ? node : null;
}
