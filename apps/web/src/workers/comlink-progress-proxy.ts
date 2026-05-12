import * as Comlink from "comlink";
import type { ProxyMethods } from "comlink";

/**
 * Comlink callback proxy for worker→main progress. Releasing it in the same
 * turn as the hosting RPC resolves can race with message draining and hang
 * `init`; this helper defers release to a macrotask and supports eager
 * {@link dispose} on client shutdown.
 */
export class ComlinkProgressProxy {
	private readonly endpoint: ProxyMethods;
	private releaseTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;

	constructor(onProgress: (percent: number) => void) {
		this.endpoint = Comlink.proxy((value: number) => {
			onProgress(value);
		}) as unknown as ProxyMethods;
	}

	/** Pass to `Comlink.expose`d APIs as `onProgress`. */
	asRemoteCallback(): (value: number) => void {
		return this.endpoint as unknown as (value: number) => void;
	}

	/**
	 * Schedule proxy release after the current stack / microtasks drain.
	 * Call from `finally` after awaiting the RPC that used this proxy.
	 */
	scheduleDeferredRelease(): void {
		if (this.disposed) return;
		this.clearTimer();
		this.releaseTimer = setTimeout(() => {
			this.releaseTimer = null;
			this.dispose();
		}, 0);
	}

	/** Clear pending deferred release and release immediately (idempotent). */
	dispose(): void {
		if (this.disposed) return;
		this.clearTimer();
		this.disposed = true;
		try {
			this.endpoint[Comlink.releaseProxy]();
		} catch {
			// Channel may already be closed.
		}
	}

	private clearTimer(): void {
		if (this.releaseTimer !== null) {
			clearTimeout(this.releaseTimer);
			this.releaseTimer = null;
		}
	}
}
