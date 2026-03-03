import type { FilePath } from "@/types/files";

export function pathSegments(path: FilePath): string[] {
    return path.split("/").filter(Boolean);
}

export function getLanguage(path: FilePath): string {
    const ext = path.split(".").pop();
    switch (ext) {
        case "toml":
            return "toml";
        default:
            return "ballerina";
    }
}

export function getDir(path: FilePath): FilePath {
    const i = path.lastIndexOf("/");
    return i >= 0 ? path.slice(0, i) : ".";
}
