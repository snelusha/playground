import { pathSegments } from "@/lib/filepath";

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

export function deleteNode(tree: FileNode[], path: FilePath): FileNode[] {
    const parts = pathSegments(path);

    function recurse(nodes: FileNode[], depth: number): FileNode[] {
        if (depth == parts.length - 1)
            return nodes.filter((node) => node.name !== parts[depth]);
        return nodes.map((node) => {
            if (node.name !== parts[depth] || node.kind !== "dir") return node;
            return { ...node, children: recurse(node.children, depth + 1) };
        });
    }

    return recurse(tree, 0);
}

export function allPaths(tree: FileNode[], prefix: FilePath = ""): FilePath[] {
    const paths: FilePath[] = [];
    for (const node of tree) {
        const currentPath = `${prefix}/${node.name}`;
        paths.push(currentPath);
        if (node.kind === "dir") {
            paths.push(...allPaths(node.children, currentPath));
        }
    }
    return paths;
}

export function pathsUnder(tree: FileNode[], path: FilePath): FilePath[] {
    const node = getNode(tree, path);
    if (!node) return [];
    if (node.kind === "file") return [path];
    return [path, ...allPaths(node.children, path)];
}
