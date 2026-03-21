import * as React from "react";

import { useFS } from "@/providers/fs-provider";

import { basename } from "@/lib/fs/core/path-utils";
import {
	buildSharePageUrl,
	encodeShareToken,
} from "@/lib/share/encode-share-link";
import type { SharePayloadV1 } from "@/lib/share/share-payload.types";

export function useShareLink() {
	const fs = useFS();

	const copyShareLink = React.useCallback(
		async (path: string) => {
			const root = fs.exportPathToFileNode(path);
			if (!root) return;

			const payload: SharePayloadV1 = {
				v: 1,
				name: basename(path),
				root,
			};

			try {
				const token = await encodeShareToken(payload);
				const url = buildSharePageUrl(token);
				await navigator.clipboard.writeText(url);
			} catch {}
		},
		[fs],
	);

	return { copyShareLink };
}
