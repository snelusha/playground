export type FsBackend = "local" | "remote";

export const FS_BACKEND: FsBackend =
	import.meta.env.VITE_FS_BACKEND === "remote" ? "remote" : "local";

export const IS_REMOTE_FS = FS_BACKEND === "remote";
