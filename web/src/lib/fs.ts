import type { FSProxy } from "@/lib/fs-proxy";
import type { FileNode, FilePath } from "@/types/files";

export function writeFile(fs: FSProxy, path: string, content: string): void {
    fs.writeFile(path, content);
}

export function mkdirAll(fs: FSProxy, path: FilePath): void {
    fs.mkdirAll(path);
}

export function remove(fs: FSProxy, path: FilePath): void {
    fs.remove(path);
}

export function move(fs: FSProxy, oldPath: FilePath, newPath: FilePath): void {
    fs.move(oldPath, newPath);
}

export function addNodeToFs(
    fs: FSProxy,
    parentPath: FilePath | null,
    node: FileNode,
): void {
    const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
    if (node.kind === "file") {
        writeFile(fs, fullPath, node.content);
    } else {
        mkdirAll(fs, fullPath);
        for (const child of node.children) {
            addNodeToFs(fs, fullPath, child);
        }
    }
}
