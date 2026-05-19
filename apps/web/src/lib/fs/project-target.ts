import { dirname, isRootPath, join } from "@/lib/fs/core/path-utils";

import type { FS } from "@/lib/fs/core/fs.interface";

export async function getBallerinaProjectTarget(
	fs: FS,
	path: string,
): Promise<string> {
	let currentDir = dirname(path);
	const hasRootPrefix = path.startsWith("/");

	while (!isRootPath(currentDir)) {
		const dirPath =
			hasRootPrefix && !currentDir.startsWith("/")
				? `/${currentDir}`
				: currentDir;
		const tomlPath = join(dirPath, "Ballerina.toml");
		if (await fs.stat(tomlPath)) return dirPath;
		currentDir = dirname(currentDir);
	}

	return path;
}
