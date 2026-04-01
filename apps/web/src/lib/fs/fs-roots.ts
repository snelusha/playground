import { join } from "@/lib/fs/core/path-utils";

export const TEMP_ROOT = "/tmp";
export const LOCAL_ROOT = "/local";
/** Virtual mount for WebSocket-backed host filesystem */
export const REMOTE_ROOT = "/remote";

export const EXAMPLES_ROOT = join(TEMP_ROOT, "examples");
export const SHARED_ROOT = join(TEMP_ROOT, "shared");
