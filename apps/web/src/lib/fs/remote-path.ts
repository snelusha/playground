import { REMOTE_ROOT } from "@/lib/fs/fs-roots";

import { isUnder } from "@/lib/fs/core/path-utils";

/** Server-relative path (empty string = workspace root). */
export function toRemoteServerPath(virtual: string): string {
	if (!isUnder(virtual, REMOTE_ROOT)) {
		throw new Error(`Not a remote path: ${virtual}`);
	}
	if (virtual === REMOTE_ROOT) return "";
	return virtual.slice(REMOTE_ROOT.length + 1);
}
