/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_REMOTE_FS_WS_URL?: string;
	readonly VITE_REMOTE_FS_AUTH_TOKEN?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
