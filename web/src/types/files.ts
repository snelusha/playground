export type FileNode =
    | { kind: "file"; name: string; content: string }
    | { kind: "dir"; name: string; children: FileNode[] };

export type FilePath = string;

// FIXME: These functions should be moved to a more appropriate place!
export function languageFromFileName(name: string): string {
    if (name.endsWith(".bal")) return "ballerina";
    if (name.endsWith(".toml")) return "toml";
    return "plaintext";
}

export function projectPathFromFilePath(filePath: FilePath): FilePath {
    const i = filePath.lastIndexOf("/");
    return i >= 0 ? filePath.slice(0, i) : filePath;
}
