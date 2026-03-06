import * as React from "react";

import {
    useActiveFile,
    useExamplesTree,
    useIsDirty,
    useIsFSReady,
    useWorkspaceTree,
} from "@/lib/fs/file-store-selectors";
import { useFileTreeStore } from "@/lib/fs/file-store.store";
import type { FileNode } from "@/lib/fs/core/file-node.types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function renderTree(nodes: FileNode[]): JSX.Element {
    if (!nodes.length) return <em className="text-muted-foreground">empty</em>;
    return (
        <ul className="ml-4 list-disc space-y-1 text-xs">
            {nodes.map((node) =>
                node.kind === "dir" ? (
                    <li key={node.name}>
                        <span className="font-semibold">{node.name}/</span>
                        {renderTree(node.children)}
                    </li>
                ) : (
                    <li key={node.name}>{node.name}</li>
                ),
            )}
        </ul>
    );
}

export function FSSamplePage() {
    const ready = useIsFSReady();
    const examplesTree = useExamplesTree();
    const workspaceTree = useWorkspaceTree();
    const activeFile = useActiveFile();
    const isDirty = useIsDirty();

    const openFile = useFileTreeStore((s) => s.openFile);
    const createFile = useFileTreeStore((s) => s.createFile);
    const saveFile = useFileTreeStore((s) => s.saveFile);
    const setEditorContent = useFileTreeStore((s) => s.setEditorContent);

    const [path, setPath] = React.useState("/browser/demo.txt");

    if (!ready) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Initialising virtual filesystem…
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col gap-4 p-4 border rounded-md bg-background">
            <div className="space-y-2">
                <h2 className="text-sm font-semibold">FS Sample Page</h2>
                <p className="text-xs text-muted-foreground">
                    Use this panel to create/open/edit a file in the
                    in-browser filesystem and verify that the store and
                    provider are wired up correctly.
                </p>
            </div>

            <div className="space-y-2">
                <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium">File path (browser namespace)</span>
                    <Input
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder="/browser/demo.txt"
                    />
                </label>
                <div className="flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        type="button"
                        onClick={() => createFile(path)}
                    >
                        Create empty file
                    </Button>
                    <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => openFile(path)}
                    >
                        Open file
                    </Button>
                    <Button
                        size="sm"
                        type="button"
                        variant="outline"
                        disabled={!isDirty}
                        onClick={() => saveFile()}
                    >
                        Save active file
                    </Button>
                </div>
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden">
                <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Active file</span>
                        {activeFile?.path && (
                            <span className="text-[10px] text-muted-foreground">
                                {activeFile.path} {isDirty ? "(unsaved changes)" : ""}
                            </span>
                        )}
                    </div>
                    <textarea
                        className="flex-1 resize-none rounded border bg-muted/40 p-2 text-xs font-mono"
                        value={activeFile?.content ?? ""}
                        onChange={(e) => setEditorContent(e.target.value)}
                        placeholder="Open or create a file to start editing…"
                    />
                </div>

                <div className="w-64 flex flex-col gap-3 overflow-auto border-l pl-3">
                    <div className="space-y-1">
                        <div className="text-xs font-medium">Examples tree</div>
                        <div className="max-h-40 overflow-auto rounded border bg-muted/40 p-2">
                            {renderTree(examplesTree)}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <div className="text-xs font-medium">Workspace tree</div>
                        <div className="max-h-40 overflow-auto rounded border bg-muted/40 p-2">
                            {renderTree(workspaceTree)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

