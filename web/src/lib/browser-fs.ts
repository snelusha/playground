import { pathSegments } from "@/lib/filepath";

import type { FSProxy } from "@/lib/fs-proxy";
import type { FileNode } from "@/types/files";

import EXAMPLES from "@/assets/examples.json";

const STORAGE_KEY = "ballerina-playground-bfs";

type FSNode = {
    isDir: boolean;
    content?: string;
    modTime?: number;
    children?: Record<string, FSNode>;
};

export class BrowserFS implements FSProxy {
    public static instance: BrowserFS;

    private data: FSNode = { isDir: true, children: {} };

    constructor() {
        this._reset(EXAMPLES as FileNode[]);
        this._load();
    }

    public static getInstance(): BrowserFS {
        if (!BrowserFS.instance) {
            BrowserFS.instance = new BrowserFS();
        }
        return BrowserFS.instance;
    }

    private _load(): void {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            this.data = raw ? JSON.parse(raw) : { isDir: true, children: {} };
        } catch {
            this.data = { isDir: true, children: {} };
        }
    }

    private _save(): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    }

    private _reset(tree: FileNode[] = []): void {
        this.data = { isDir: true, children: {} };
        this._save();

        if (!!tree.length) this._seed(tree);
    }

    private _seed(tree: FileNode[], prefix = ""): void {
        for (const node of tree) {
            const path = prefix ? `${prefix}/${node.name}` : node.name;
            if (node.kind === "dir") {
                this.mkdirAll(path);
                this._seed(node.children, path);
            } else {
                this.writeFile(path, node.content);
            }
        }
        this._save();
    }

    private _getNode(path: string, autoCreateDirs = true): FSNode | null {
        if (!path || path === "." || path === "/") return this.data;
        const parts = pathSegments(path);
        let node: FSNode = this.data;
        for (const part of parts) {
            const children = node.children ?? {};
            if (!children[part]) {
                if (autoCreateDirs) {
                    if (!node.children) node.children = {};
                    node.children[part] = { isDir: true, children: {} };
                } else {
                    return null;
                }
            }
            node = node.children![part];
        }
        return node;
    }

    private _getParentAndName(path: string): {
        parent: FSNode | null;
        name: string;
    } {
        const parts = pathSegments(path);
        if (parts.length === 0) return { parent: null, name: "/" };
        const name = parts.slice(-1)[0];
        const parentPath = parts.slice(0, -1).join("/");
        const parentNode = parentPath ? this._getNode(parentPath) : this.data;
        return { parent: parentNode ?? null, name };
    }

    open(path: string): {
        content: string;
        size: number;
        modTime: number;
        isDir: boolean;
    } | null {
        const node = this._getNode(path, false);
        if (!node || node.isDir) return null;
        const content = node.content ?? "";
        return {
            content,
            size: content.length,
            modTime: node.modTime ?? 0,
            isDir: false,
        };
    }

    stat(
        path: string,
    ): { name: string; size: number; modTime: number; isDir: boolean } | null {
        const node = this._getNode(path, false);
        if (!node) return null;
        const name = path.split("/").filter(Boolean).slice(-1)[0] ?? "/";
        const size = node.isDir ? 0 : (node.content?.length ?? 0);
        return {
            name,
            size,
            modTime: node.modTime ?? 0,
            isDir: node.isDir,
        };
    }

    readDir(path: string): { name: string; isDir: boolean }[] | null {
        const node = this._getNode(path, false);
        if (!node || !node.isDir || !node.children) return null;
        return Object.entries(node.children).map(([name, child]) => ({
            name,
            isDir: child.isDir,
        }));
    }

    writeFile(path: string, content: string): boolean {
        try {
            const { parent, name } = this._getParentAndName(path);
            if (!parent) return false;
            const existing = parent.children?.[name];
            if (existing?.isDir) return false;
            if (!parent.children) parent.children = {};
            parent.children[name] = {
                isDir: false,
                content,
                modTime: Date.now(),
            };
            this._save();
            return true;
        } catch {
            return false;
        }
    }

    remove(path: string): boolean {
        const parts = pathSegments(path);
        if (parts.length === 0) return false;
        const name = parts.slice(-1)[0];
        const parentPath = parts.slice(0, -1).join("/");
        const parentNode = parentPath
            ? this._getNode(parentPath, false)
            : this.data;
        if (!parentNode?.children?.[name]) return false;
        delete parentNode.children[name];
        this._save();
        return true;
    }

    move(oldPath: string, newPath: string): boolean {
        try {
            const node = this._getNode(oldPath, false);
            if (!node) return false;
            const { parent: newParent, name: newName } =
                this._getParentAndName(newPath);
            const { parent: oldParent, name: oldName } =
                this._getParentAndName(oldPath);
            if (!newParent || !oldParent) return false;
            if (newParent.children?.[newName]?.isDir) return false;
            if (!newParent.children) newParent.children = {};
            newParent.children[newName] = node;
            delete oldParent.children![oldName];
            this._save();
            return true;
        } catch {
            return false;
        }
    }

    mkdirAll(path: string): boolean {
        if (!path || path === "." || path === "/") return true;
        const parts = pathSegments(path);
        let node: FSNode = this.data;
        for (const part of parts) {
            if (!node.children) node.children = {};
            if (!node.children[part]) {
                node.children[part] = {
                    isDir: true,
                    children: {},
                    modTime: Date.now(),
                };
            } else if (!node.children[part].isDir) {
                return false;
            }
            node = node.children[part];
        }
        this._save();
        return true;
    }

    transformToTree(path: string = ""): FileNode[] {
        const entries = this.readDir(path);
        if (!entries) return [];
        const result: FileNode[] = [];
        for (const entry of entries) {
            const fullPath = path ? `${path}/${entry.name}` : entry.name;
            if (entry.isDir) {
                result.push({
                    kind: "dir",
                    name: entry.name,
                    children: this.transformToTree(fullPath),
                });
            } else {
                const f = this.open(fullPath);
                result.push({
                    kind: "file",
                    name: entry.name,
                    content: f?.content ?? "",
                });
            }
        }
        return result.sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }
}

export function getTree(fs: FSProxy, path = ""): FileNode[] {
    const entries = fs.readDir(path);
    if (!entries) return [];
    const result: FileNode[] = [];
    for (const entry of entries) {
        const fullPath = path ? `${path}/${entry.name}` : entry.name;
        if (entry.isDir) {
            result.push({
                kind: "dir",
                name: entry.name,
                children: getTree(fs, fullPath),
            });
        } else {
            const f = fs.open(fullPath);
            result.push({
                kind: "file",
                name: entry.name,
                content: f?.content ?? "",
            });
        }
    }
    return result.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
}
