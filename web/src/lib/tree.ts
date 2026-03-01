import { pathSegments } from "@/lib/paths";

import type { FileNode, FilePath } from "@/types/files";

export function addNode(
    tree: FileNode[],
    parentPath: FilePath | null,
    node: FileNode,
): FileNode[] {
    if (!parentPath) return [...tree, node];
    return updateNode(tree, parentPath, (parent) => {
        if (parent.kind !== "dir") return parent;
        return { ...parent, children: [...parent.children, node] };
    });
}

export function getNode(tree: FileNode[], path: FilePath): FileNode | null {
    const parts = pathSegments(path);
    let current = tree;

    for (let i = 0; i < parts.length; i++) {
        const found = current.find((n) => n.name === parts[i]);
        if (!found) return null;
        if (i === parts.length - 1) return found;
        if (found.kind !== "dir") return null;
        current = found.children;
    }

    return null;
}

export function updateNode(
    tree: FileNode[],
    path: FilePath,
    updater: (node: FileNode) => FileNode,
): FileNode[] {
    const parts = pathSegments(path);

    function recurse(nodes: FileNode[], depth: number): FileNode[] {
        return nodes.map((n) => {
            if (n.name !== parts[depth]) return n;
            if (depth === parts.length - 1) return updater(n);
            if (n.kind !== "dir") return n;
            return { ...n, children: recurse(n.children, depth + 1) };
        });
    }

    return recurse(tree, 0);
}
