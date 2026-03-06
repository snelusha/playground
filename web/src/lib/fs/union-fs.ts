import type { FS } from "@/lib/fs/core/fs.interface";
import type { EphemeralFS } from "@/lib/fs/ephemeral-fs";
import type { LocalStorageFS } from "@/lib/fs/local-storage-fs";
import type { FileNode } from "@/lib/fs/core/file-node.types";

export class UnionFS implements FS {
    constructor(
        private readonly examples: EphemeralFS,
        private readonly browser: LocalStorageFS,
    ) {}

    open(path: string) {
        return this._target(path).open(path);
    }

    stat(path: string) {
        // TODO: Handle cross-target stat (merge results)
        return this._target(path).stat(path);
    }

    readDir(path: string) {
        // TODO: Handle cross-target readDir (merge results)
        return this._target(path).readDir(path);
    }

    writeFile(path: string, content: string) {
        return this._target(path).writeFile(path, content);
    }

    remove(path: string) {
        return this._target(path).remove(path);
    }

    move(oldPath: string, newPath: string) {
        // TODO: Handle cross-target move (copy + remove)
        const oldTarget = this._target(oldPath);
        const newTarget = this._target(newPath);
        if (oldTarget !== newTarget) return false;
        return oldTarget.move(oldPath, newPath);
    }

    mkdirAll(path: string) {
        return this._target(path).mkdirAll(path);
    }

    // FIXME: Implement these properly

    private _namespaceOf(path: string): "examples" | "browser" {
        if (path.startsWith("/examples/")) return "examples";
        return "browser";
    }

    private _target(path: string): FS {
        const ns = this._namespaceOf(path);
        return ns === "examples" ? this.examples : this.browser;
    }

    /**
     * Reset a single example file to its original content.
     */
    resetExampleFile(_: string): boolean {
        return false;
    }

    /**
     * Returns true if the given path lives in the examples namespace.
     */
    isExample(path: string): boolean {
        return this._namespaceOf(path) === "examples";
    }

    /**
     * Returns true if the given path lives in the user workspace namespace.
     */
    isWorkspace(path: string): boolean {
        return this._namespaceOf(path) === "browser";
    }

    /**
     * Build a full FileNode tree from both layers, sorted dirs-first.
     */
    transformToTree(): FileNode[] {
        return [
            {
                kind: "dir",
                name: "examples",
                children: this.examples.transformToTree("/examples"),
            },
            {
                kind: "dir",
                name: "browser",
                children: this.browser.transformToTree("/browser"),
            },
        ];
    }

    examplesTree(): FileNode[] {
        return this.examples.transformToTree("/examples");
    }

    workspaceTree(): FileNode[] {
        return this.browser.transformToTree("/browser");
    }
}
