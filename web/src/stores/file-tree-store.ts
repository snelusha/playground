import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

import type { LayeredFS } from "@/lib/fs/layered-fs";
import type { FileNode } from "@/lib/fs/core/file-node.types";

const EMPTY_MAIN_BAL = `import ballerina/io;

public function main() {
		io:println("Hello, World!");
}`;

export type ActiveFile = {
    path: string;
    content: string;
    dirty: boolean;
};

type FileTreeState = {
    tempTree: FileNode[];
    localTree: FileNode[];
    activeFile: ActiveFile | null;
    ready: boolean;
};

type FileTreeActions = {
    init(fs: LayeredFS): void;

    openFile(path: string): void;
    saveFile(): boolean;
    createEmptyFile(): boolean;
    createFile(path: string): boolean;
    deleteFile(path: string): boolean;
    renameFile(oldPath: string, newPath: string): boolean;

    createDir(path: string): boolean;
    deleteDir(path: string): boolean;

    updateFileContent(content: string): void;

    _syncTrees(): void;
};

export const useFileTreeStore = create<FileTreeState & FileTreeActions>()(
    immer((set, get) => {
        let fs: LayeredFS | null = null;

        const _fs = (): LayeredFS => {
            if (!fs) throw new Error("[FileTreeStore] FS not initialised");
            return fs;
        };

        return {
            tempTree: [],
            localTree: [],
            activeFile: null,
            ready: false,

            init(instance) {
                if (fs) return;
                fs = instance;
                set((s) => {
                    s.tempTree = fs!.tempTree();
                    s.localTree = fs!.localTree();
                    s.ready = true;
                });
            },

            openFile(path) {
                const file = _fs().open(path);
                if (!file) return;
                set((s) => {
                    s.activeFile = {
                        path,
                        content: file.content,
                        dirty: false,
                    };
                });
            },

            saveFile() {
                const { activeFile } = get();
                if (!activeFile || !activeFile.dirty) return false;
                const result = _fs().writeFile(
                    activeFile.path,
                    activeFile.content,
                );
                if (!result) return false;
                set((s) => {
                    if (s.activeFile) s.activeFile.dirty = false;
                });
                get()._syncTrees();
                return true;
            },

            createEmptyFile() {
                const { localTree } = get();
                const nextNum =
                    localTree.length > 0
                        ? localTree.length + 1
                        : 1;
                const path = `/local/${String(nextNum).padStart(2, "0")}-main.bal`;
                const result = _fs().writeFile(path, EMPTY_MAIN_BAL);
                if (!result) return false;
                get()._syncTrees();
                get().openFile(path);
                return true;
            },

            createFile(path) {
                const result = _fs().writeFile(path, "");
                if (!result) return false;
                get()._syncTrees();
                return true;
            },

            deleteFile(path) {
                const result = _fs().remove(path);
                if (!result) return false;
                get()._syncTrees();
                return true;
            },

            renameFile(oldPath, newPath) {
                const result = _fs().move(oldPath, newPath);
                if (!result) return false;
                get()._syncTrees();
                return true;
            },

            createDir(path) {
                const result = _fs().mkdirAll(path);
                if (!result) return false;
                get()._syncTrees();
                return true;
            },

            deleteDir(path) {
                const result = _fs().remove(path);
                if (!result) return false;
                set((s) => {
                    if (s.activeFile?.path.startsWith(path))
                        s.activeFile = null;
                });
                get()._syncTrees();
                return true;
            },

            updateFileContent(content) {
                set((s) => {
                    if (s.activeFile) {
                        s.activeFile.content = content;
                        s.activeFile.dirty = true;
                    }
                });
            },

            _syncTrees() {
                const fs = _fs();
                set((s) => {
                    s.tempTree = fs.tempTree();
                    s.localTree = fs.localTree();
                });
            },
        };
    }),
);

export const useTempTree = () => useFileTreeStore((s) => s.tempTree);
export const useLocalTree = () => useFileTreeStore((s) => s.localTree);

export const useActiveFile = () => useFileTreeStore((s) => s.activeFile);

export const useFileTreeActions = () =>
    useFileTreeStore((s) => ({
        openFile: s.openFile,
        saveFile: s.saveFile,
        createEmptyFile: s.createEmptyFile,
        createFile: s.createFile,
        deleteFile: s.deleteFile,
        renameFile: s.renameFile,
        createDir: s.createDir,
        deleteDir: s.deleteDir,
        updateFileContent: s.updateFileContent,
    }));
