export function createFs(inputFiles: Map<string, string>) {
	const modTime = Date.now();
	const files = new Map(
		[...inputFiles.entries()].map(([path, content]) => [path, content]),
	);
	const dirs = new Set<string>(["/"]);

	for (const file of files.keys()) {
		let dir = file.split("/").slice(0, -1).join("/") || "/";
		while (!dirs.has(dir)) {
			dirs.add(dir);
			dir = dir.split("/").slice(0, -1).join("/") || "/";
		}
	}

	return {
		async open(path: string) {
			const content = files.get(path);
			if (content === undefined) return null;
			return { content, size: content.length, modTime, isDir: false };
		},
		async stat(path: string) {
			if (dirs.has(path)) {
				return {
					name: path.split("/").pop() || "/",
					size: 0,
					modTime,
					isDir: true,
				};
			}

			const content = files.get(path);
			if (content === undefined) return null;
			return {
				name: path.split("/").pop(),
				size: content.length,
				modTime,
				isDir: false,
			};
		},
		async readDir(path: string) {
			if (!dirs.has(path)) return null;

			const prefix = path === "/" ? "/" : `${path}/`;
			const entries = new Map<string, { name: string; isDir: boolean }>();

			for (const dir of dirs) {
				if (dir === path || !dir.startsWith(prefix)) continue;
				const name = dir.slice(prefix.length).split("/")[0];
				entries.set(name, { name, isDir: true });
			}

			for (const file of files.keys()) {
				if (!file.startsWith(prefix)) continue;
				const name = file.slice(prefix.length).split("/")[0];
				entries.set(name, entries.get(name) ?? { name, isDir: false });
			}

			return [...entries.values()];
		},
	};
}
