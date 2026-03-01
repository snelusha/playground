import type { FilePath } from "@/types/files";

export function pathSegments(path: FilePath): string[] {
    return path.split("/").filter(Boolean);
}
