export function pathSegments(path: string): string[] {
	return path.split("/").filter(Boolean);
}

export function basename(path: string): string {
	const parts = pathSegments(path);
	return parts[parts.length - 1] ?? "/";
}

export function dirname(path: string): string {
	const parts = pathSegments(path);
	return parts.slice(0, -1).join("/");
}

export function joinPath(...segments: string[]): string {
	return segments
		.flatMap((s) => s.split("/"))
		.filter(Boolean)
		.join("/");
}

export function isRootPath(path: string): boolean {
	return !path || path === "." || path === "/";
}
