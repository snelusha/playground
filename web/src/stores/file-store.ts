import { create } from "zustand";

import { BrowserFS } from "@/lib/browser-fs";
import { getNode, updateNode } from "@/lib/tree";
import { writeFile } from "@/lib/fs";

import type { FileNode, FilePath } from "@/types/files";

export type FileState = {
    tree: FileNode[];
    selectedFilePath: FilePath | null;
};

export type FileActions = {
    setTree: (tree: FileNode[]) => void;

    selectFile: (path: FilePath | null) => void;
    updateFile: (path: FilePath, content: string) => void;
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
}));

export function useSelectedFile(): Extract<FileNode, { kind: "file" }> | null {
    const tree = useFileStore((state) => state.tree);
    const path = useFileStore((state) => state.selectedFilePath);

    if (!path) return null;

    const node = getNode(tree, path);
    return node && node.kind === "file" ? node : null;
}
