import type {
	WsRequest,
	WsResponse,
	WsPush,
	Pending,
	PushHandler,
} from "./types";

const REQUEST_TIMEOUT_MS = 60_000;
const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000];

function isPush(msg: WsResponse | WsPush): msg is WsPush {
	return "channel" in msg;
}

/** Default matches apps/server default PORT=3000 */
function resolveUrl(override?: string): string {
	if (override) return override;
	return "ws://localhost:3000";
}

export class WsTransport {
	private ws: WebSocket | null = null;
	private nextId = 1;
	private queue: WsRequest[] = [];
	private readonly pending = new Map<string, Pending>();
	private readonly listeners = new Map<string, Set<PushHandler>>();
	private reconnectAttempt = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private disposed = false;
	private readonly url: string;

	constructor(url?: string) {
		this.url = resolveUrl(url);
		this.connect();
	}

	request<T = unknown>(method: string, params?: unknown): Promise<T> {
		if (this.disposed) return Promise.reject(new Error("Transport disposed"));

		const id = String(this.nextId++);

		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Request timed out: ${method}`));
			}, REQUEST_TIMEOUT_MS);

			this.pending.set(id, {
				resolve: resolve as (v: unknown) => void,
				reject,
				timer,
			});

			this.flush({ id, method, params: params as Record<string, unknown> });
		});
	}

	subscribe(channel: string, handler: PushHandler): () => void {
		let handlers = this.listeners.get(channel);
		if (!handlers) {
			handlers = new Set();
			this.listeners.set(channel, handlers);
		}
		handlers.add(handler);

		return () => {
			handlers!.delete(handler);
			if (handlers!.size === 0) this.listeners.delete(channel);
		};
	}

	dispose(): void {
		this.disposed = true;
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.queue = [];
		for (const p of this.pending.values()) {
			clearTimeout(p.timer);
			p.reject(new Error("Transport disposed"));
		}
		this.pending.clear();
		this.ws?.close();
		this.ws = null;
	}

	private connect(): void {
		if (this.disposed) return;
		const ws = new WebSocket(this.url);

		ws.addEventListener("open", () => {
			this.ws = ws;
			this.reconnectAttempt = 0;
			for (const msg of this.queue.splice(0)) {
				ws.send(JSON.stringify(msg));
			}
		});

		ws.addEventListener("message", (ev) => {
			void this.handleMessage(ev.data);
		});

		ws.addEventListener("close", () => {
			if (this.ws === ws) this.ws = null;
			this.scheduleReconnect();
		});
	}

	private flush(msg: WsRequest): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		} else {
			this.queue.push(msg);
		}
	}

	private async handleMessage(data: unknown): Promise<void> {
		let raw: string;
		if (typeof data === "string") {
			raw = data;
		} else if (data instanceof Blob) {
			raw = await data.text();
		} else {
			console.warn("[WsTransport] unsupported message payload");
			return;
		}

		let msg: WsResponse | WsPush;
		try {
			msg = JSON.parse(raw);
		} catch {
			console.warn("[WsTransport] unparseable message", raw);
			return;
		}

		if (isPush(msg)) {
			const handlers = this.listeners.get(msg.channel);
			if (handlers) {
				for (const h of handlers) {
					try {
						h(msg.data);
					} catch {
						/* swallow */
					}
				}
			}
			return;
		}

		const p = this.pending.get(msg.id);
		if (!p) return;
		clearTimeout(p.timer);
		this.pending.delete(msg.id);
		if (msg.error) {
			p.reject(new Error(msg.error.message));
		} else {
			p.resolve(msg.result);
		}
	}

	private scheduleReconnect(): void {
		if (this.disposed) return;
		const delay =
			RECONNECT_DELAYS_MS[
				Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)
			]!;
		this.reconnectAttempt++;
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}
}
